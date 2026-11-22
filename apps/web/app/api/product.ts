// Endpoint sản phẩm — đổi đường dẫn chỉ cần sửa ở file này. Nuxt tự import `productApi`.
// Lỗi tự hiện bằng message.error; truyền config { silent: true } nếu muốn tự xử lý ở chỗ gọi.
import type { AxiosRequestConfig } from 'axios';
import type { Page, Product } from '~/types';
import { http } from '~/utils/http';

export interface ProductListParams {
  cursor?: string;
  limit?: number;
}

export interface CreateProductBody {
  name: string;
  affiliateUrl: string;
  description?: string;
  category?: string;
}

const PRODUCTS = '/products';

export const productApi = {
  getProducts: (params: ProductListParams = {}, config?: AxiosRequestConfig) => http.get<Page<Product>>(PRODUCTS, { ...config, params }),
  createProduct: (body: CreateProductBody, config?: AxiosRequestConfig) => http.post<Product>(PRODUCTS, body, config),
};
