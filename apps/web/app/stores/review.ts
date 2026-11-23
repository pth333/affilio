// Store dùng chung cho Hộp thư duyệt, viết theo Composition API (setup store).
// Sidebar, Tổng quan và màn /review cùng đọc một nguồn: danh sách chờ duyệt, video đang chọn
// và các thao tác sửa cảnh / nhờ AI sửa / duyệt.
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { videoApi } from '~/api/video';
import { message } from '~/composables/useMessage';
import type { ReviewDecision, Scene, VideoDetail, VideoListItem, VideoStatus } from '~/types';

const PROCESSING_STATUSES: readonly VideoStatus[] = [
  'queued',
  'drafting',
  'auto_check',
  'previewing',
  'revising',
  'rendering',
  'needs_changes',
];

/** Gộp các lần gọi làm mới liên tiếp (sidebar + trang + polling) thành một request. */
let inboxRequest: Promise<void> | null = null;

export const useReviewStore = defineStore('review', () => {
  // ── State ──
  const pendingVideos = ref<VideoListItem[]>([]);
  const detail = ref<VideoDetail | null>(null);
  const selectedId = ref('');
  const loadingInbox = ref(false);
  const loadingDetail = ref(false);
  /** Đang gửi thao tác sửa/duyệt — khoá nút để tránh gửi hai lần. */
  const busy = ref(false);
  const savingSceneId = ref<string | null>(null);
  const revisingSceneId = ref<string | null>(null);

  const pendingCount = computed(() => pendingVideos.value.length);
  const scenes = computed<Scene[]>(() => detail.value?.version?.spec.scenes ?? []);
  const status = computed<VideoStatus | null>(() => detail.value?.video.status ?? null);
  const canReview = computed(() => detail.value?.video.status === 'pending_review' && Boolean(detail.value.version));
  const isProcessing = computed(() => {
    const current = status.value;
    return current !== null && PROCESSING_STATUSES.includes(current);
  });


  /** Tải danh sách video đang chờ duyệt; lỗi mạng không bật toast để không ồn khi tự làm mới. */
  async function refreshInbox(): Promise<void> {
    if (inboxRequest) {
      await inboxRequest;
      return;
    }
    loadingInbox.value = true;
    const request = (async () => {
      try {
        const page = await videoApi.getVideos({ status: 'pending_review', limit: 100 }, { silent: true });
        pendingVideos.value = page.items;
      } catch (err) {
        console.warn('[reviewStore] không tải được hộp thư duyệt', err);
      }
    })();
    inboxRequest = request;
    try {
      await request;
    } finally {
      if (inboxRequest === request) inboxRequest = null;
      loadingInbox.value = false;
    }
  }

  /** Tải chi tiết một video; bỏ qua kết quả cũ nếu người dùng đã chọn video khác. */
  async function loadDetail(id?: string): Promise<void> {
    const targetId = id ?? selectedId.value;
    if (!targetId) {
      detail.value = null;
      return;
    }
    selectedId.value = targetId;
    loadingDetail.value = true;
    try {
      const loaded = await videoApi.getVideoDetail(targetId, { silent: true });
      if (selectedId.value === targetId) detail.value = loaded;
      console.log('[reviewStore] đã tải chi tiết video', targetId, loaded);
    } catch (err) {
      if (selectedId.value === targetId) {
        console.warn('[reviewStore] không tải được video', err);
        detail.value = null;
      }
    } finally {
      loadingDetail.value = false;
    }
  }

  async function selectVideo(id: string): Promise<void> {
    selectedId.value = id;
    await loadDetail(id);
  }

  function clearSelection(): void {
    selectedId.value = '';
    detail.value = null;
  }

  /** Người duyệt sửa tay lời thoại một cảnh; video vẫn nằm trong hộp duyệt. */
  async function saveScene(scene: Scene, narration: string): Promise<boolean> {
    const version = detail.value?.version;
    const text = narration.trim();
    if (!version || !text || busy.value) return false;
    savingSceneId.value = scene.id;
    busy.value = true;
    try {
      await videoApi.updateScene(selectedId.value, scene.id, { versionId: version.id, narration: text });
      message.success('Đã lưu cảnh. Video vẫn nằm trong hộp thư duyệt.');
      await loadDetail(selectedId.value);
      await refreshInbox();
      return true;
    } catch {
      // interceptor đã hiện thông báo lỗi
      return false;
    } finally {
      savingSceneId.value = null;
      busy.value = false;
    }
  }

  /** Nhờ AI viết lại một cảnh; video tạm rời hộp duyệt rồi tự quay lại khi worker xong. */
  async function reviseScene(scene: Scene, instruction: string): Promise<boolean> {
    const version = detail.value?.version;
    if (!version || busy.value) return false;
    revisingSceneId.value = scene.id;
    busy.value = true;
    try {
      await videoApi.reviseScene(selectedId.value, scene.id, {
        versionId: version.id,
        instruction: instruction.trim() || undefined,
      });
      message.success('AI đang sửa cảnh này. Video sẽ tự quay lại hộp thư duyệt khi xong.');
      await loadDetail(selectedId.value);
      await refreshInbox();
      return true;
    } catch {
      // interceptor đã hiện thông báo lỗi
      return false;
    } finally {
      revisingSceneId.value = null;
      busy.value = false;
    }
  }

  /** Duyệt/từ chối phiên bản đang xem, sau đó chọn video kế tiếp trong hộp thư. */
  async function submitDecision(decision: ReviewDecision): Promise<boolean> {
    const version = detail.value?.version;
    if (!version || !canReview.value || busy.value) return false;
    busy.value = true;
    try {
      await videoApi.submitReview(selectedId.value, { versionId: version.id, decision });
      message.success(decision === 'approve' ? 'Đã duyệt video — chuyển sang render bản cuối.' : 'Đã từ chối bản nháp.');

      const index = pendingVideos.value.findIndex((video) => video.id === selectedId.value);
      await refreshInbox();
      const next = pendingVideos.value[Math.min(Math.max(index, 0), Math.max(pendingVideos.value.length - 1, 0))];
      if (next) await selectVideo(next.id);
      else clearSelection();
      return true;
    } catch {
      // interceptor đã hiện thông báo lỗi
      return false;
    } finally {
      busy.value = false;
    }
  }

  return {
    // state
    pendingVideos,
    detail,
    selectedId,
    loadingInbox,
    loadingDetail,
    busy,
    savingSceneId,
    revisingSceneId,
    // giá trị suy ra
    pendingCount,
    scenes,
    status,
    canReview,
    isProcessing,
    // thao tác
    refreshInbox,
    loadDetail,
    selectVideo,
    clearSelection,
    saveScene,
    reviseScene,
    submitDecision,
  };
});
