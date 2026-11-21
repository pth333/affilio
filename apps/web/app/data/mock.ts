// Dữ liệu mẫu cho các màn hình chưa có API. Khi API sẵn sàng, thay bằng http.get(...) ở từng trang.
import type { Channel, ContentTemplate, Draft, LibraryProduct, NavItem, PublishItem } from '~/types';

export const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Tổng quan', icon: 'layout-grid' },
  { to: '/channels', label: 'Kênh của tôi', icon: 'tv-minimal-play' },
  { to: '/products', label: 'Sản phẩm', icon: 'package' },
  { to: '/review', label: 'Hộp thư duyệt', icon: 'inbox', count: 12 },
  { to: '/templates', label: 'Định dạng & mẫu', icon: 'layers' },
  { to: '/publishing', label: 'Đăng tải & hiệu quả', icon: 'chart-no-axes-combined' },
  { to: '/videos', label: 'Video (API thật)', icon: 'film' },
];

export const CURRENT_USER = { name: 'Minh Anh', role: 'Chủ sở hữu', workspace: 'Minh Anh Studio' };

export const AI_QUOTA = { used: 32, limit: 100 };

export const DASHBOARD_STATS = {
  pending: 12,
  ready: 8,
  publishedThisWeek: 24,
  weeklyGrowth: 20,
  weeklyBars: [8, 12, 9, 15, 11, 18, 24],
};

export const CHANNELS: Channel[] = [
  {
    id: 'ch1',
    name: 'Góc Công Nghệ',
    handle: '@goccongnghe.daily',
    tag: 'Công nghệ',
    color: '#7860e5',
    status: 'active',
    followers: 128_500,
    growth: 24.6,
    views: 3842,
    videos: 86,
    series: 'Đồ công nghệ dưới 300K',
    pending: 6,
    published: 86,
    trend: [12, 18, 15, 24, 22, 31, 38],
  },
  {
    id: 'ch2',
    name: 'Nhà Xinh Mỗi Ngày',
    handle: '@nhaxinhmoingay',
    tag: 'Nhà cửa',
    color: '#3f9d63',
    status: 'active',
    followers: 86_200,
    growth: 18.2,
    views: 2156,
    videos: 54,
    series: 'Góc phòng ngủ chill',
    pending: 4,
    published: 54,
    trend: [10, 14, 12, 16, 19, 18, 24],
  },
  {
    id: 'ch3',
    name: 'Đẹp Có Gu',
    handle: '@depcogu',
    tag: 'Làm đẹp',
    color: '#e88a3a',
    status: 'active',
    followers: 64_800,
    growth: 32.1,
    views: 1924,
    videos: 42,
    series: 'Skincare tối giản',
    pending: 2,
    published: 42,
    trend: [6, 9, 8, 13, 15, 20, 26],
  },
  {
    id: 'ch4',
    name: 'Bếp Nhà Lười',
    handle: '@bepnhaluoi',
    tag: 'Gia dụng',
    color: '#4b86d6',
    status: 'archived',
    followers: 12_400,
    growth: -3.2,
    views: 412,
    videos: 18,
    series: 'Đồ bếp tiện lợi',
    pending: 0,
    published: 18,
    trend: [8, 7, 7, 6, 6, 5, 5],
  },
];

export const PRODUCTS: LibraryProduct[] = [
  { id: 'p1', name: 'Quạt mini để bàn Jisulife', brand: 'Jisulife', category: 'Công nghệ', price: 289_000, affiliateUrl: 'https://s.shopee.vn/affilio-jisu', hasClip: true, color: '#7860e5' },
  { id: 'p2', name: 'Tai nghe không dây Baseus', brand: 'Baseus', category: 'Công nghệ', price: 359_000, affiliateUrl: 'https://s.shopee.vn/affilio-baseus', hasClip: true, color: '#4b86d6' },
  { id: 'p3', name: 'Đèn ngủ cảm ứng Miffy', brand: 'Miffy', category: 'Nhà cửa', price: 199_000, affiliateUrl: 'https://s.shopee.vn/affilio-miffy', hasClip: false, color: '#3f9d63' },
  { id: 'p4', name: 'Serum The Ordinary Niacinamide', brand: 'The Ordinary', category: 'Làm đẹp', price: 235_000, affiliateUrl: 'https://s.shopee.vn/affilio-ordinary', hasClip: false, color: '#e88a3a' },
];

const DEFAULT_CHECKS = [
  { label: 'Không cam kết sai sự thật', passed: true },
  { label: 'Giá khớp với link affiliate', passed: true },
  { label: 'Có kêu gọi hành động rõ ràng', passed: true },
  { label: 'Độ dài 15–45 giây', passed: true },
];

export const DRAFTS: Draft[] = [
  {
    id: 'd1',
    productName: 'Quạt mini để bàn Jisulife',
    channelName: 'Góc Công Nghệ',
    hook: 'Mùa hè này, đây là món đồ mình dùng nhiều nhất.',
    score: 92,
    price: 289_000,
    createdAt: '08:12',
    duration: 28,
    color: '#7860e5',
    checks: DEFAULT_CHECKS,
    scenes: [
      { role: 'Mở đầu', start: 0, end: 3, text: 'Mùa hè này, đây là món đồ mình dùng nhiều nhất.' },
      { role: 'Thông tin', start: 3, end: 12, text: 'Quạt Jisulife pin 4000mAh, chạy êm, gập gọn bỏ túi.' },
      { role: 'Trải nghiệm', start: 12, end: 23, text: 'Mình để bàn làm việc cả ngày, mức 2 là đủ mát mà không ồn.' },
      { role: 'Kêu gọi', start: 23, end: 28, text: 'Giá đang 289K, link mình để ở bio nhé.' },
    ],
  },
  {
    id: 'd2',
    productName: 'Tai nghe không dây Baseus',
    channelName: 'Góc Công Nghệ',
    hook: 'Đừng mua tai nghe mới nếu bạn chưa biết 3 điều này.',
    score: 89,
    price: 359_000,
    createdAt: '07:48',
    duration: 32,
    color: '#4b86d6',
    checks: DEFAULT_CHECKS,
    scenes: [
      { role: 'Mở đầu', start: 0, end: 4, text: 'Đừng mua tai nghe mới nếu bạn chưa biết 3 điều này.' },
      { role: 'Thông tin', start: 4, end: 14, text: 'Chống ồn chủ động, pin 30 giờ, kết nối Bluetooth 5.3.' },
      { role: 'Trải nghiệm', start: 14, end: 26, text: 'Đi xe buýt mình bật chống ồn là gần như không nghe tiếng xe.' },
      { role: 'Kêu gọi', start: 26, end: 32, text: 'Dưới 400K mà được vậy thì quá hời, link ở bio.' },
    ],
  },
  {
    id: 'd3',
    productName: 'Đèn ngủ cảm ứng Miffy',
    channelName: 'Nhà Xinh Mỗi Ngày',
    hook: 'Góc phòng ngủ đáng yêu hơn chỉ với 199K.',
    score: 87,
    price: 199_000,
    createdAt: '07:30',
    duration: 24,
    color: '#3f9d63',
    checks: [...DEFAULT_CHECKS.slice(0, 3), { label: 'Độ dài 15–45 giây', passed: true }],
    scenes: [
      { role: 'Mở đầu', start: 0, end: 3, text: 'Góc phòng ngủ đáng yêu hơn chỉ với 199K.' },
      { role: 'Thông tin', start: 3, end: 10, text: 'Đèn cảm ứng chạm, 3 mức sáng, sạc USB-C.' },
      { role: 'Trải nghiệm', start: 10, end: 19, text: 'Ánh vàng dịu, bật cả đêm không chói mắt.' },
      { role: 'Kêu gọi', start: 19, end: 24, text: 'Ai mê Miffy thì nhanh tay nhé, link ở bio.' },
    ],
  },
  {
    id: 'd4',
    productName: 'Serum The Ordinary Niacinamide',
    channelName: 'Đẹp Có Gu',
    hook: 'Lỗ chân lông to? Thử cái này 2 tuần xem.',
    score: 78,
    price: 235_000,
    createdAt: '06:55',
    duration: 30,
    color: '#e88a3a',
    checks: [
      { label: 'Không cam kết sai sự thật', passed: false },
      ...DEFAULT_CHECKS.slice(1),
    ],
    scenes: [
      { role: 'Mở đầu', start: 0, end: 4, text: 'Lỗ chân lông to? Thử cái này 2 tuần xem.' },
      { role: 'Thông tin', start: 4, end: 13, text: 'Niacinamide 10% + Zinc 1%, kết cấu lỏng nhẹ.' },
      { role: 'Trải nghiệm', start: 13, end: 25, text: 'Mình dùng buổi tối, da bớt dầu rõ sau vài tuần.' },
      { role: 'Kêu gọi', start: 25, end: 30, text: 'Giá 235K, link chính hãng ở bio.' },
    ],
  },
];

export const BEST_HOOK = {
  text: 'Đừng mua tai nghe mới nếu bạn chưa biết 3 điều này.',
  channel: 'Góc Công Nghệ',
  views: 82_400,
  completion: 76.8,
  multiplier: 2.4,
};

export const TEMPLATES: ContentTemplate[] = [
  { id: 't1', name: 'Cảnh báo trước khi mua', description: 'Mở bằng một lời cảnh báo để giữ chân người xem.', glyph: '!', cover: '#fdecec', structure: ['Cảnh báo', 'Lý do', 'Giải pháp', 'Kêu gọi'], completionRate: 74, clickRate: 18, system: true },
  { id: 't2', name: 'Top 3 lý do', description: 'Liệt kê nhanh 3 điểm mạnh của sản phẩm.', glyph: '3', cover: '#efebfc', structure: ['Hook', 'Lý do 1', 'Lý do 2', 'Lý do 3', 'Kêu gọi'], completionRate: 68, clickRate: 15, system: true },
  { id: 't3', name: 'So sánh A vs B', description: 'Đặt cạnh sản phẩm cùng phân khúc để nổi bật giá trị.', glyph: 'VS', cover: '#eaf2fc', structure: ['Đặt vấn đề', 'So sánh', 'Kết luận', 'Kêu gọi'], completionRate: 71, clickRate: 21, system: true },
  { id: 't4', name: 'Hỏi đáp nhanh', description: 'Trả lời câu hỏi phổ biến của người mua.', glyph: '?', cover: '#e9f6ee', structure: ['Câu hỏi', 'Trả lời', 'Minh chứng', 'Kêu gọi'], completionRate: 65, clickRate: 12, system: true },
  { id: 't5', name: 'Săn sale', description: 'Nhấn mạnh ưu đãi có thời hạn.', glyph: '%', cover: '#fdf3e3', structure: ['Giá gốc', 'Giá sale', 'Lý do nên mua', 'Kêu gọi'], completionRate: 62, clickRate: 24, system: true },
  { id: 't6', name: 'Series theo chủ đề', description: 'Một tập trong chuỗi nội dung của kênh.', glyph: '#', cover: '#f3effb', structure: ['Giới thiệu tập', 'Sản phẩm', 'Đánh giá', 'Hẹn tập sau'], completionRate: 70, clickRate: 14, system: false },
  { id: 't7', name: 'Trước & sau', description: 'Cho thấy thay đổi rõ ràng khi dùng sản phẩm.', glyph: '↗', cover: '#e8f5f4', structure: ['Trước', 'Quá trình', 'Sau', 'Kêu gọi'], completionRate: 77, clickRate: 19, system: false },
];

export const PUBLISH_QUEUE: PublishItem[] = [
  {
    id: 'pub1',
    productName: 'Quạt mini để bàn Jisulife',
    channelName: 'Góc Công Nghệ',
    caption: 'Mùa hè này, đây là món đồ mình dùng nhiều nhất 🌬️ Pin trâu, chạy êm, gập gọn bỏ túi.',
    hashtags: ['#quatmini', '#jisulife', '#review', '#congnghe'],
    affiliateUrl: 'https://s.shopee.vn/affilio-jisu',
    approvedAt: '09:05',
    color: '#7860e5',
  },
  {
    id: 'pub2',
    productName: 'Tai nghe không dây Baseus',
    channelName: 'Góc Công Nghệ',
    caption: 'Đừng mua tai nghe mới nếu bạn chưa biết 3 điều này 🎧',
    hashtags: ['#tainghe', '#baseus', '#chongon'],
    affiliateUrl: 'https://s.shopee.vn/affilio-baseus',
    approvedAt: '08:40',
    color: '#4b86d6',
  },
  {
    id: 'pub3',
    productName: 'Đèn ngủ cảm ứng Miffy',
    channelName: 'Nhà Xinh Mỗi Ngày',
    caption: 'Góc phòng ngủ đáng yêu hơn chỉ với 199K ✨',
    hashtags: ['#denngu', '#miffy', '#decor'],
    affiliateUrl: 'https://s.shopee.vn/affilio-miffy',
    approvedAt: '08:10',
    color: '#3f9d63',
  },
];

export const PERFORMANCE = [
  { channel: 'Góc Công Nghệ', views: 128_500, completion: 71.2, clicks: 3842, orders: 214, revenue: 4_280_000 },
  { channel: 'Nhà Xinh Mỗi Ngày', views: 86_200, completion: 66.4, clicks: 2156, orders: 128, revenue: 2_150_000 },
  { channel: 'Đẹp Có Gu', views: 64_800, completion: 69.8, clicks: 1924, orders: 97, revenue: 1_920_000 },
];
