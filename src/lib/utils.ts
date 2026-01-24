import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "Today";
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function getProviderColor(provider: string): string {
  switch (provider.toLowerCase()) {
    case "anthropic":
      return "bg-anthropic text-white";
    case "openai":
      return "bg-openai text-white";
    case "gemini":
      return "bg-gemini text-white";
    case "deepseek":
      return "bg-deepseek text-white";
    default:
      return "bg-primary text-primary-foreground";
  }
}

export function getProviderIcon(provider: string): string {
  switch (provider.toLowerCase()) {
    case "anthropic":
      return "A";
    case "openai":
      return "O";
    case "gemini":
      return "G";
    case "deepseek":
      return "D";
    default:
      return "?";
  }
}
