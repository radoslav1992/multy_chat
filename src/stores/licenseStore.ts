import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

type LicenseStatus = "inactive" | "checking" | "active" | "unverified" | "error";

interface LicenseResult {
  success: boolean;
  message: string;
  instance_id: string | null;
}

interface LicenseState {
  licenseKey: string;
  status: LicenseStatus;
  message: string;
  lastChecked: string | null;
  installedAt: string;
  graceDays: number;
  instanceId: string | null;
  loadLicense: () => void;
  activateLicense: (key: string) => Promise<void>;
  deactivateLicense: () => Promise<void>;
  clearLicense: () => void;
  getGraceDaysRemaining: () => number;
  isWithinGrace: () => boolean;
  requiresActivation: () => boolean;
}

const LICENSE_KEY_STORAGE = "license_key";
const LICENSE_INSTANCE_ID_STORAGE = "license_instance_id";
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
  const installed = new Date(installedAt);
  const now = new Date();
  
  // Compare calendar days, not 24-hour periods
  const installedDay = new Date(installed.getFullYear(), installed.getMonth(), installed.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSince = Math.round((today.getTime() - installedDay.getTime()) / msPerDay);
  
  return Math.max(0, GRACE_DAYS - daysSince);
};

const getInstallId = (): string => {
  const existing = localStorage.getItem(LICENSE_INSTALL_ID);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(LICENSE_INSTALL_ID, id);
  return id;
};

const getInstanceName = (): string => {
  // Create a unique instance name based on install ID
  const installId = getInstallId();
  return `OmniChat-${installId.slice(0, 8)}`;
};

export const useLicenseStore = create<LicenseState>((set, get) => ({
  licenseKey: "",
  status: "inactive",
  message: "",
  lastChecked: null,
  installedAt: getInstalledAt(),
  graceDays: GRACE_DAYS,
  instanceId: null,

  loadLicense: () => {
    const licenseKey = localStorage.getItem(LICENSE_KEY_STORAGE) || "";
    const status = (localStorage.getItem(LICENSE_STATUS_STORAGE) as LicenseStatus) || "inactive";
    const message = localStorage.getItem(LICENSE_MESSAGE_STORAGE) || "";
    const lastChecked = localStorage.getItem(LICENSE_LAST_CHECKED_STORAGE);
    const instanceId = localStorage.getItem(LICENSE_INSTANCE_ID_STORAGE);
    const installedAt = getInstalledAt();
    set({ licenseKey, status, message, lastChecked, installedAt, instanceId });
  },

  activateLicense: async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;

    set({ status: "checking", message: "Verifying license..." });

    const instanceName = getInstanceName();
    const now = new Date().toISOString();

    try {
      const result = await invoke<LicenseResult>("activate_license", {
        licenseKey: trimmed,
        instanceName,
      });
      
      if (result.success) {
        localStorage.setItem(LICENSE_KEY_STORAGE, trimmed);
        localStorage.setItem(LICENSE_STATUS_STORAGE, "active");
        localStorage.setItem(LICENSE_MESSAGE_STORAGE, result.message);
        localStorage.setItem(LICENSE_LAST_CHECKED_STORAGE, now);
        if (result.instance_id) {
          localStorage.setItem(LICENSE_INSTANCE_ID_STORAGE, result.instance_id);
        }
        
        set({
          licenseKey: trimmed,
          status: "active",
          message: result.message,
          lastChecked: now,
          instanceId: result.instance_id,
        });
      } else {
        localStorage.setItem(LICENSE_STATUS_STORAGE, "error");
        localStorage.setItem(LICENSE_MESSAGE_STORAGE, result.message);
        localStorage.setItem(LICENSE_LAST_CHECKED_STORAGE, now);
        set({
          status: "error",
          message: result.message,
          lastChecked: now,
        });
      }
    } catch (error) {
      const errorMessage = `License verification failed: ${error}`;
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

  deactivateLicense: async () => {
    const { licenseKey, instanceId } = get();
    if (!licenseKey || !instanceId) return;

    set({ status: "checking", message: "Deactivating license..." });
    const now = new Date().toISOString();

    try {
      const result = await invoke<LicenseResult>("deactivate_license", {
        licenseKey,
        instanceId,
      });
      
      if (result.success) {
        // Clear all license data
        localStorage.removeItem(LICENSE_KEY_STORAGE);
        localStorage.removeItem(LICENSE_INSTANCE_ID_STORAGE);
        localStorage.removeItem(LICENSE_STATUS_STORAGE);
        localStorage.removeItem(LICENSE_MESSAGE_STORAGE);
        localStorage.removeItem(LICENSE_LAST_CHECKED_STORAGE);
        
        set({
          licenseKey: "",
          status: "inactive",
          message: result.message,
          lastChecked: now,
          instanceId: null,
        });
      } else {
        set({
          status: "error",
          message: result.message,
          lastChecked: now,
        });
      }
    } catch (error) {
      set({
        status: "error",
        message: `Failed to deactivate license: ${error}`,
        lastChecked: now,
      });
    }
  },

  clearLicense: () => {
    localStorage.removeItem(LICENSE_KEY_STORAGE);
    localStorage.removeItem(LICENSE_INSTANCE_ID_STORAGE);
    localStorage.removeItem(LICENSE_STATUS_STORAGE);
    localStorage.removeItem(LICENSE_MESSAGE_STORAGE);
    localStorage.removeItem(LICENSE_LAST_CHECKED_STORAGE);
    set({ licenseKey: "", status: "inactive", message: "", lastChecked: null, instanceId: null });
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
