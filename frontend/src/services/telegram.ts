// Telegram WebApp helper functions

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export function getTelegramUser(): TelegramUser | null {
  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
}

export function getTelegramUsername(): string {
  const user = getTelegramUser();
  if (user?.username) return user.username;
  if (user?.first_name) return user.first_name;
  return '';
}

export function showAlert(message: string) {
  if (window.Telegram?.WebApp?.showAlert) {
    window.Telegram.WebApp.showAlert(message);
  } else {
    alert(message);
  }
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Telegram?.WebApp?.showConfirm) {
      window.Telegram.WebApp.showConfirm(message, (confirmed: boolean) => resolve(confirmed));
    } else {
      resolve(window.confirm(message));
    }
  });
}

export function hapticFeedback(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' = 'light') {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      if (['success', 'error', 'warning'].includes(type)) {
        tg.HapticFeedback.notificationOccurred(type);
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
    }
  } catch (e) {
    // Ignore haptic errors
  }
}

export function shareLink(url: string, text?: string) {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
      tg.openTelegramLink(shareUrl);
      return;
    }
  } catch (e) {
    // Fall through to clipboard
  }
  navigator.clipboard.writeText(url);
}