// Thư viện sản phẩm dùng chung cho màn Sản phẩm và popup tạo video.
// Hiện dữ liệu mẫu nằm ở client (data/mock.ts); khi API có endpoint tải ảnh/clip thì chỉ thay
// phần lưu trữ trong file này, giao diện không phải sửa.
import { PRODUCTS } from '~/data/mock';
import type { LibraryProduct, ProductClip } from '~/types';

/** Ánh xạ id sản phẩm thư viện → id sản phẩm trên API, giữ lại qua lần tải trang. */
const API_ID_STORAGE_KEY = 'affilio-library-api-ids';

const products = ref<LibraryProduct[]>(PRODUCTS.map((product) => ({ ...product, imageUrl: null, clips: [] })));

function readApiIds(): Record<string, string> {
  if (!import.meta.client) return {};
  try {
    const raw = localStorage.getItem(API_ID_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch (err) {
    console.warn('[useProductLibrary] không đọc được id sản phẩm đã lưu', err);
    return {};
  }
}

const apiProductIds = ref<Record<string, string>>(readApiIds());

function saveApiIds(): void {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(API_ID_STORAGE_KEY, JSON.stringify(apiProductIds.value));
  } catch (err) {
    console.warn('[useProductLibrary] không lưu được id sản phẩm', err);
  }
}

export interface NewLibraryProduct {
  name: string;
  category: string;
  price: number;
  affiliateUrl: string;
  imageUrl?: string | null;
}

/** Thông tin tối thiểu để đồng bộ sản phẩm lên API (nhận được cả object chỉ đọc). */
export type ApiProductSyncInput = Pick<LibraryProduct, 'id' | 'name' | 'brand' | 'category' | 'affiliateUrl'>;

export function useProductLibrary() {
  /** Thêm sản phẩm mới lên đầu thư viện. */
  function addProduct(input: NewLibraryProduct): LibraryProduct {
    const name = input.name.trim();
    const product: LibraryProduct = {
      id: `p-${crypto.randomUUID()}`,
      name,
      brand: name.split(/\s+/).at(-1) ?? name,
      category: input.category,
      price: input.price,
      affiliateUrl: input.affiliateUrl.trim(),
      hasClip: false,
      color: pickAccentColor(name),
      imageUrl: input.imageUrl ?? null,
      clips: [],
    };
    products.value = [product, ...products.value];
    return product;
  }

  /** Gắn clip vừa kéo thả vào sản phẩm; trả về số clip đã thêm. */
  function addClips(productId: string, files: File[]): number {
    const product = products.value.find((item) => item.id === productId);
    if (!product) return 0;
    const clips: ProductClip[] = files.map((file) => ({
      id: `clip-${crypto.randomUUID()}`,
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
    }));
    product.clips = [...(product.clips ?? []), ...clips];
    product.hasClip = product.clips.length > 0;
    return clips.length;
  }

  /**
   * Bảo đảm sản phẩm có bản ghi trên API rồi trả về id để tạo video.
   * Sản phẩm thư viện chỉ nằm ở client nên lần đầu dùng sẽ được tạo trên API; id được nhớ lại.
   */
  async function ensureApiProductId(product: ApiProductSyncInput): Promise<string> {
    const cached = apiProductIds.value[product.id];
    if (cached) return cached;
    const created = await productApi.createProduct({
      name: product.name,
      affiliateUrl: product.affiliateUrl,
      category: product.category,
      description: [product.brand, product.category].filter(Boolean).join(' · ') || undefined,
    });
    apiProductIds.value = { ...apiProductIds.value, [product.id]: created.id };
    saveApiIds();
    return created.id;
  }

  return { products, addProduct, addClips, ensureApiProductId };
}
