import { spawn } from 'node:child_process';
import { sha256, stableStringify } from '#src/spec/hash.ts';
import type { Motion, Scene } from '#src/spec/schema.ts';

/** Đổi preset render (độ phân giải, codec, filter…) thì tăng số này để cache cảnh cũ không bị dùng nhầm. */
export const RENDER_PRESET_VERSION = 1;

export interface RenderPreset {
  name: 'preview' | 'final';
  width: number;
  height: number;
  fps: number;
  crf: number;
  x264Preset: string;
}

export const RENDER_PRESETS: Record<RenderPreset['name'], RenderPreset> = {
  preview: { name: 'preview', width: 540, height: 960, fps: 25, crf: 30, x264Preset: 'veryfast' },
  final: { name: 'final', width: 1080, height: 1920, fps: 30, crf: 20, x264Preset: 'medium' },
};

// ───────────────────────── Hash cache ─────────────────────────

export interface SceneHashInput {
  scene: Scene;
  /** Model sinh ảnh AI, bắt buộc với ai_image/ai_clip chưa có asset. */
  imageModel?: string;
  subtitleStyle: string;
  presetName: RenderPreset['name'];
}

/** Thiếu một đầu vào trong hash là sẽ dùng nhầm cache cũ (mục 7 plan v4). */
export function sceneHash({ scene, imageModel, subtitleStyle, presetName }: SceneHashInput): string {
  const visualSource = scene.visual.asset_id
    ? { asset_id: scene.visual.asset_id }
    : { prompt: scene.visual.prompt ?? null, model: imageModel ?? null };
  return sha256(
    stableStringify({
      narration: scene.narration,
      voice: scene.voice,
      visualType: scene.visual.type,
      visualSource,
      motion: scene.visual.motion,
      mascot: scene.mascot ?? null,
      subtitleStyle,
      duration: scene.duration,
      preset: presetName,
      presetVersion: RENDER_PRESET_VERSION,
    }),
  );
}

export function ttsKey(narration: string, voice: Scene['voice']): string {
  return sha256(stableStringify({ narration, voice }));
}

export function imageKey(input: { model: string; prompt: string; width: number; height: number; steps: number }): string {
  return sha256(stableStringify(input));
}

// ───────────────────────── Lệnh FFmpeg ─────────────────────────

const ZOOM_MAX = 1.25;

/** Biểu thức zoompan cho 5 kiểu chuyển động. */
export function motionFilter(motion: Motion, frames: number, width: number, height: number, fps: number): string {
  const step = ((ZOOM_MAX - 1) / Math.max(frames, 1)).toFixed(6);
  const center = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  let expr: string;
  switch (motion) {
    case 'static':
      expr = `z='1':${center}`;
      break;
    case 'zoom_in':
      expr = `z='min(zoom+${step},${ZOOM_MAX})':${center}`;
      break;
    case 'zoom_out':
      expr = `z='if(eq(on,0),${ZOOM_MAX},max(zoom-${step},1))':${center}`;
      break;
    case 'pan_left':
      expr = `z='${ZOOM_MAX}':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
      break;
    case 'pan_right':
      expr = `z='${ZOOM_MAX}':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)'`;
      break;
  }
  // Phóng ảnh gấp 2 trước khi zoompan để chuyển động mượt, không giật pixel.
  return [
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
    `crop=${width * 2}:${height * 2}`,
    `zoompan=${expr}:d=${frames}:s=${width}x${height}:fps=${fps}`,
    'format=yuv420p',
  ].join(',');
}

export interface ImageSceneArgs {
  image: string;
  audio?: string;
  output: string;
  durationSec: number;
  motion: Motion;
  preset: RenderPreset;
}

/** Cảnh ảnh tĩnh + chuyển động (+ giọng đọc nếu có). */
export function buildImageSceneArgs({ image, audio, output, durationSec, motion, preset }: ImageSceneArgs): string[] {
  const frames = Math.max(1, Math.round(durationSec * preset.fps));
  const args = ['-y', '-loop', '1', '-i', image];
  if (audio) args.push('-i', audio);
  args.push('-vf', motionFilter(motion, frames, preset.width, preset.height, preset.fps));
  args.push('-t', durationSec.toFixed(3));
  args.push('-c:v', 'libx264', '-preset', preset.x264Preset, '-crf', String(preset.crf), '-r', String(preset.fps));
  if (audio) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  else args.push('-an');
  args.push('-movflags', '+faststart', output);
  return args;
}

export interface MascotOverlayArgs {
  scene: string;
  mascotClip: string;
  output: string;
  position: 'right_mid' | 'left_mid';
  from: number;
  to: number;
  preset: RenderPreset;
}

/** Chồng clip mascot nền trong suốt (WebM VP9 alpha) lên cảnh, ở hai bên giữa khung để không đè phụ đề. */
export function buildMascotOverlayArgs({ scene, mascotClip, output, position, from, to, preset }: MascotOverlayArgs): string[] {
  const mascotWidth = Math.round(preset.width / 3);
  const margin = Math.round(preset.width * 0.04);
  const x = position === 'right_mid' ? `W-w-${margin}` : String(margin);
  const filter =
    `[1:v]scale=${mascotWidth}:-1,setpts=PTS+${from}/TB[m];` +
    `[0:v][m]overlay=${x}:H*0.30:enable='between(t,${from},${to})'[v]`;
  return [
    '-y',
    '-i',
    scene,
    '-c:v',
    'libvpx-vp9',
    '-i',
    mascotClip,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    preset.x264Preset,
    '-crf',
    String(preset.crf),
    '-c:a',
    'copy',
    output,
  ];
}

/** Chạy ffmpeg; lỗi thì ném kèm đuôi stderr để dễ debug. */
export function runFfmpeg(args: string[], { bin = 'ffmpeg', signal }: { bin?: string; signal?: AbortSignal } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['-hide_banner', '-loglevel', 'error', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      ...(signal ? { signal } : {}),
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg thoát mã ${code}: ${stderr.trim()}`));
    });
  });
}
