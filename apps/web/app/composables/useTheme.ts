// Chế độ sáng/tối dùng chung. Gọi: const { isDark, toggleTheme } = useTheme()
const STORAGE_KEY = 'affilio-theme';
const isDark = ref(false);
let initialized = false;

function applyTheme(dark: boolean): void {
  isDark.value = dark;
  document.documentElement.classList.toggle('dark', dark);
}

function readSavedTheme(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[useTheme] không đọc được localStorage', err);
    return null;
  }
}

export function useTheme() {
  if (!initialized && import.meta.client) {
    initialized = true;
    const saved = readSavedTheme();
    applyTheme(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function toggleTheme(): void {
    applyTheme(!isDark.value);
    try {
      localStorage.setItem(STORAGE_KEY, isDark.value ? 'dark' : 'light');
    } catch (err) {
      console.warn('[useTheme] không lưu được lựa chọn giao diện', err);
    }
  }

  return { isDark: readonly(isDark), toggleTheme };
}
