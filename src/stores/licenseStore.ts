import { create } from "zustand";

type LicenseStatus = "inactive" | "checking" | "active" | "unverified" | "error";

interface LicenseState {
  licenseKey: string;
  status: LicenseStatus;
  message: string;
  lastChecked: string | null;
  installedAt: string;
  graceDays: number;
  loadLicense: () => void;
  activateLicense: (key: string) => Promise<void>;
  clearLicense: () => void;
  getGraceDaysRemaining: () => number;
  isWithinGrace: () => boolean;
  requiresActivation: () => boolean;
}

const LICENSE_KEY_STORAGE = "license_key";
const LICENSE_INSTALL_ID = "license_install_id";
const LICENSE_STATUS_STORAGE = "license_status";
const LICENSE_MESSAGE_STORAGE = "license_message";
const LICENSE_LAST_CHECKED_STORAGE = "license_last_checked";
const LICENSE_INSTALLED_AT_STORAGE = "license_installed_at";
const GRACE_DAYS = 7;

const getInstalledAt = (): string => {
  const existing = localStorage.getItem(LICENSE_INSTALLED_AT_STORAGE);
  if (existing) return existing;
  const now = new Date().toISOString();
  localStorage.setItem(LICENSE_INSTALLED_AT_STORAGE, now);
  return now;
};

const getGraceDaysRemaining = (installedAt: string): number => {
  const installedTime = new Date(installedAt).getTime();
  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSince = Math.floor((now - installedTime) / msPerDay);
  return Math.max(0, GRACE_DAYS - daysSince);
};

const getInstallId = (): string => {
  const existing = localStorage.getItem(LICENSE_INSTALL_ID);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(LICENSE_INSTALL_ID, id);
  return id;
};

const getVerifyUrl = (): string | undefined => {
  const url = import.meta.env.VITE_LICENSE_VERIFY_URL as string | undefined;
  return url?.trim() ? url : undefined;
};

export const useLicenseStore = create<LicenseState>((set, get) => ({
  licenseKey: "",
  status: "inactive",
  message: "",
  lastChecked: null,
  installedAt: getInstalledAt(),
  graceDays: GRACE_DAYS,

  loadLicense: () => {
    const licenseKey = localStorage.getItem(LICENSE_KEY_STORAGE) || "";
    const status = (localStorage.getItem(LICENSE_STATUS_STORAGE) as LicenseStatus) || "inactive";
    const message = localStorage.getItem(LICENSE_MESSAGE_STORAGE) || "";
    const lastChecked = localStorage.getItem(LICENSE_LAST_CHECKED_STORAGE);
    const installedAt = getInstalledAt();
    set({ licenseKey, status, message, lastChecked, installedAt });
  },

  activateLicense: async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;

    set({ status: "checking", message: "Verifying license..." });

    const verifyUrl = getVerifyUrl();
    const installId = getInstallId();
    const now = new Date().toISOString();

    if (!verifyUrl) {
      localStorage.setItem(LICENSE_KEY_STORAGE, trimmed);
      localStorage.setItem(LICENSE_STATUS_STORAGE, "unverified");
      localStorage.setItem(
        LICENSE_MESSAGE_STORAGE,
        "Saved locally. Set VITE_LICENSE_VERIFY_URL to enable verification."
      );
      localStorage.setItem(LICENSE_LAST_CHECKED_STORAGE, now);
      set({
        licenseKey: trimmed,
        status: "unverified",
        message: "Saved locally. Set VITE_LICENSE_VERIFY_URL to enable verification.",
        lastChecked: now,
      });
      return;
    }

    try {
      const response = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          license_key: trimmed,
          install_id: installId,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.valid === false) {
        const errorMessage = data.message || "Invalid license key.";
        localStorage.setItem(LICENSE_STATUS_STORAGE, "error");
        localStorage.setItem(LICENSE_MESSAGE_STORAGE, errorMessage);
        localStorage.setItem(LICENSE_LAST_CHECKED_STORAGE, now);
        set({
          status: "error",
          message: errorMessage,
          lastChecked: now,
        });
        return;
      }

      const successMessage = data.message || "License verified.";
      localStorage.setItem(LICENSE_KEY_STORAGE, trimmed);
      localStorage.setItem(LICENSE_STATUS_STORAGE, "active");
      localStorage.setItem(LICENSE_MESSAGE_STORAGE, successMessage);
      localStorage.setItem(LICENSE_LAST_CHECKED_STORAGE, now);
      set({
        licenseKey: trimmed,
        status: "active",
        message: successMessage,
        lastChecked: now,
      });
    } catch (error) {
      const errorMessage = "License verification failed. Check your connection.";
      localStorage.setItem(LICENSE_STATUS_STORAGE, "error");
      localStorage.setItem(LICENSE_MESSAGE_STORAGE, errorMessage);
      localStorage.setItem(LICENSE_LAST_CHECKED_STORAGE, now);
      set({
        status: "error",
        message: errorMessage,
        lastChecked: now,
      });
    }
  },

  clearLicense: () => {
    localStorage.removeItem(LICENSE_KEY_STORAGE);
    localStorage.removeItem(LICENSE_STATUS_STORAGE);
    localStorage.removeItem(LICENSE_MESSAGE_STORAGE);
    localStorage.removeItem(LICENSE_LAST_CHECKED_STORAGE);
    set({ licenseKey: "", status: "inactive", message: "", lastChecked: null });
  },

  getGraceDaysRemaining: () => {
    const { installedAt } = get();
    return getGraceDaysRemaining(installedAt);
  },

  isWithinGrace: () => {
    const { status, installedAt } = get();
    if (status === "active") return true;
    return getGraceDaysRemaining(installedAt) > 0;
  },

  requiresActivation: () => {
    const { status } = get();
    if (status === "active") return false;
    return !get().isWithinGrace();
  },
}));
