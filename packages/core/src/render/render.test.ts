import { describe, expect, it } from 'vitest';
import { validSpec } from '#src/test/fixtures.ts';
import { buildImageSceneArgs, motionFilter, RENDER_PRESETS, sceneHash } from '#src/render/index.ts';

describe('sceneHash', () => {
  const scene = validSpec().scenes[1];
  if (!scene) throw new Error('thiếu cảnh');
  const base = { scene, subtitleStyle: 'default', presetName: 'preview' as const };

  it('ổn định và đổi theo mọi đầu vào ảnh hưởng render', () => {
    const h = sceneHash(base);
    expect(sceneHash(base)).toBe(h);
    expect(sceneHash({ ...base, presetName: 'final' })).not.toBe(h);
    expect(sceneHash({ ...base, subtitleStyle: 'bold' })).not.toBe(h);
    expect(sceneHash({ ...base, scene: { ...scene, narration: 'khác' } })).not.toBe(h);
    expect(sceneHash({ ...base, scene: { ...scene, visual: { ...scene.visual, motion: 'pan_left' } } })).not.toBe(h);
  });

  it('cảnh có asset thì model ảnh không ảnh hưởng hash', () => {
    expect(sceneHash({ ...base, imageModel: 'a' })).toBe(sceneHash({ ...base, imageModel: 'b' }));
  });
});

describe('ffmpeg args', () => {
  it('motionFilter sinh đủ chuỗi filter cho mọi kiểu chuyển động', () => {
    for (const m of ['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right'] as const) {
      const f = motionFilter(m, 75, 540, 960, 25);
      expect(f).toContain('zoompan=');
      expect(f).toContain('s=540x960');
      expect(f.endsWith('format=yuv420p')).toBe(true);
    }
  });

  it('có audio thì thêm -shortest, không có thì -an', () => {
    const preset = RENDER_PRESETS.preview;
    const withAudio = buildImageSceneArgs({ image: 'a.jpg', audio: 'a.mp3', output: 'o.mp4', durationSec: 3, motion: 'static', preset });
    expect(withAudio).toEqual(expect.arrayContaining(['-i', 'a.mp3', '-shortest']));
    expect(withAudio.at(-1)).toBe('o.mp4');
    const silent = buildImageSceneArgs({ image: 'a.jpg', output: 'o.mp4', durationSec: 3, motion: 'static', preset });
    expect(silent).toContain('-an');
    expect(silent).not.toContain('-shortest');
  });
});
