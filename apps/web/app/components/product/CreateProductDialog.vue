<script setup lang="ts">
// Popup tạo sản phẩm: thông tin cơ bản, ảnh sản phẩm và clip quay từ điện thoại (kéo thả).
// Sản phẩm được thêm thẳng vào thư viện dùng chung (composables/useProductLibrary.ts).
import { PRODUCT_CATEGORIES } from '~/data/mock';
import type { LibraryProduct } from '~/types';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [LibraryProduct] }>();

const { addProduct, addClips } = useProductLibrary();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CLIP_BYTES = 200 * 1024 * 1024;

const form = reactive({
  name: '',
  category: PRODUCT_CATEGORIES[0] ?? 'Công nghệ',
  price: null as number | null,
  affiliateUrl: '',
  imageUrl: null as string | null,
});
const clips = ref<{ key: string; file: File }[]>([]);
const draggingImage = ref(false);
const draggingClip = ref(false);
const imageInput = ref<HTMLInputElement | null>(null);
const clipInput = ref<HTMLInputElement | null>(null);

const canSubmit = computed(
  () => form.name.trim().length > 0 && /^https?:\/\/\S+$/i.test(form.affiliateUrl.trim()),
);

function resetForm(): void {
  Object.assign(form, {
    name: '',
    category: PRODUCT_CATEGORIES[0] ?? 'Công nghệ',
    price: null,
    affiliateUrl: '',
    imageUrl: null,
  });
  clips.value = [];
}

// ── Ảnh sản phẩm
async function applyImageFile(file: File | null | undefined): Promise<void> {
  if (!file) return;
  if (!isImageFile(file)) {
    message.warning('Chỉ nhận tệp ảnh (JPG, PNG, WebP).');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    message.warning('Ảnh tối đa 5 MB. Hãy chọn ảnh nhỏ hơn.');
    return;
  }
  try {
    form.imageUrl = await readFileAsDataUrl(file);
  } catch {
    message.error('Không đọc được ảnh. Hãy chọn ảnh khác.');
  }
}

function handleImageChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  void applyImageFile(input.files?.[0]);
  input.value = '';
}

function handleImageDrop(event: DragEvent): void {
  draggingImage.value = false;
  void applyImageFile(event.dataTransfer?.files?.[0]);
}

// ── Clip từ điện thoại
function addClipFiles(files: FileList | null | undefined): void {
  if (!files || files.length === 0) return;
  const all = Array.from(files);
  const videos = all.filter(isVideoFile);
  if (videos.length < all.length) {
    message.warning(`Đã bỏ qua ${all.length - videos.length} tệp không phải video.`);
  }
  const accepted = videos.filter((file) => file.size <= MAX_CLIP_BYTES);
  if (accepted.length < videos.length) {
    message.warning(`Đã bỏ qua ${videos.length - accepted.length} clip lớn hơn 200 MB.`);
  }
  clips.value = [...clips.value, ...accepted.map((file) => ({ key: crypto.randomUUID(), file }))];
}

function handleClipChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  addClipFiles(input.files);
  input.value = '';
}

function handleClipDrop(event: DragEvent): void {
  draggingClip.value = false;
  addClipFiles(event.dataTransfer?.files);
}

function removeClip(key: string): void {
  clips.value = clips.value.filter((clip) => clip.key !== key);
}

function createProduct(): void {
  if (!canSubmit.value) {
    message.warning('Nhập tên sản phẩm và link affiliate hợp lệ (bắt đầu bằng http).');
    return;
  }
  const product = addProduct({
    name: form.name,
    category: form.category,
    price: Number(form.price) || 0,
    affiliateUrl: form.affiliateUrl,
    imageUrl: form.imageUrl,
  });
  if (clips.value.length > 0) addClips(product.id, clips.value.map((clip) => clip.file));

  message.success(`Đã thêm “${product.name}” vào thư viện`);
  emit('created', product);
  resetForm();
  emit('close');
}
</script>

<template>
  <AppModal
    :open="props.open"
    :width="700"
    eyebrow="Sản phẩm mới"
    title="Tạo sản phẩm"
    description="Thông tin càng đầy đủ, AI càng viết kịch bản sát sản phẩm."
    @close="emit('close')"
  >
    <div class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="form-label">Tên sản phẩm</span>
          <input v-model="form.name" class="field w-full" maxlength="200" placeholder="VD: Quạt mini để bàn Jisulife" />
        </label>

        <label class="block">
          <span class="form-label">Danh mục</span>
          <select v-model="form.category" class="field w-full">
            <option v-for="category in PRODUCT_CATEGORIES" :key="category" :value="category">{{ category }}</option>
          </select>
        </label>

        <label class="block">
          <span class="form-label">Giá</span>
          <span class="relative block">
            <input
              v-model.number="form.price"
              type="number"
              min="0"
              step="1000"
              class="field w-full pr-8 tabular-nums"
              placeholder="289000"
            />
            <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">đ</span>
          </span>
        </label>

        <label class="block sm:col-span-2">
          <span class="form-label">Link affiliate</span>
          <input v-model="form.affiliateUrl" type="url" class="field w-full" placeholder="https://s.shopee.vn/…" />
          <span class="form-hint">Link sản phẩm trên sàn — dùng để gắn vào caption khi đăng.</span>
        </label>
      </div>

      <!-- Ảnh sản phẩm -->
      <div>
        <p class="form-label">Ảnh sản phẩm</p>
        <div
          class="flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed p-3.5 transition-colors"
          :class="draggingImage ? 'border-primary bg-primary-soft/60' : 'border-line bg-surface-2'"
          @dragover.prevent="draggingImage = true"
          @dragleave.prevent="draggingImage = false"
          @drop.prevent="handleImageDrop"
        >
          <label class="grid size-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-line bg-surface">
            <img v-if="form.imageUrl" :src="form.imageUrl" alt="Ảnh sản phẩm" class="size-full object-cover" />
            <span v-else class="grid place-items-center gap-1 text-muted">
              <AppIcon name="image" :size="24" />
              <span class="text-[0.75rem]">Chọn ảnh</span>
            </span>
            <input ref="imageInput" type="file" accept="image/*" class="sr-only" @change="handleImageChange" />
          </label>

          <div class="min-w-0 flex-1 text-[0.85rem]">
            <p class="font-medium">Kéo thả ảnh vào đây hoặc bấm vào khung để chọn</p>
            <p class="mt-1 text-muted">JPG, PNG, WebP · tối đa 5 MB</p>
            <button
              v-if="form.imageUrl"
              type="button"
              class="mt-2 inline-flex items-center gap-1 font-medium text-bad hover:underline"
              @click="form.imageUrl = null"
            >
              <AppIcon name="trash-2" :size="14" /> Xoá ảnh
            </button>
          </div>
        </div>
      </div>

      <!-- Clip từ điện thoại -->
      <div>
        <p class="form-label">Clip từ điện thoại</p>
        <div
          class="dropzone cursor-pointer"
          :class="draggingClip ? 'dropzone-active' : ''"
          @click="clipInput?.click()"
          @dragover.prevent="draggingClip = true"
          @dragleave.prevent="draggingClip = false"
          @drop.prevent="handleClipDrop"
        >
          <span class="mx-auto mb-2 grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
            <AppIcon name="smartphone" :size="22" />
          </span>
          <p class="font-medium">Kéo thả clip điện thoại vào đây</p>
          <p class="mt-1 text-[0.85rem] text-muted">hoặc bấm để chọn nhiều clip · MP4, MOV, WebM</p>
          <input ref="clipInput" type="file" accept="video/*" multiple class="sr-only" @click.stop @change="handleClipChange" />
        </div>

        <ul v-if="clips.length > 0" class="mt-2 space-y-2">
          <li v-for="clip in clips" :key="clip.key" class="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
            <AppIcon name="film" :size="16" class="text-muted" />
            <span class="min-w-0 flex-1 truncate text-[0.88rem]">{{ clip.file.name }}</span>
            <span class="shrink-0 text-[0.8rem] text-muted tabular-nums">{{ formatFileSize(clip.file.size) }}</span>
            <button
              type="button"
              class="icon-btn size-7 text-muted hover:text-bad"
              :aria-label="`Xoá ${clip.file.name}`"
              @click="removeClip(clip.key)"
            >
              <AppIcon name="x" :size="15" />
            </button>
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-[0.85rem] text-muted">
          {{
            clips.length > 0
              ? `${clips.length} clip sẽ được gắn vào sản phẩm`
              : 'Clip là tuỳ chọn — có clip thật giúp video tự nhiên hơn.'
          }}
        </p>
        <div class="flex gap-2">
          <button type="button" class="btn" @click="emit('close')">Huỷ</button>
          <button type="button" class="btn btn-primary" :disabled="!canSubmit" @click="createProduct">
            <AppIcon name="plus" :size="16" /> Tạo sản phẩm
          </button>
        </div>
      </div>
    </template>
  </AppModal>
</template>
