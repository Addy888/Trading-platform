/**
 * Shared Quota Manager
 * 
 * Provider-wide quota state shared across all components and hooks.
 * Prevents multiple components from independently polling when quota is exhausted.
 */

interface QuotaState {
  isExhausted: boolean;
  exhaustedAt: number | null;
  resetTime: number | null;
  provider: string | null;
  errorMessage: string | null;
}

const STORAGE_KEY = 'market_data_quota_state';

class QuotaManager {
  private state: QuotaState = {
    isExhausted: false,
    exhaustedAt: null,
    resetTime: null,
    provider: null,
    errorMessage: null,
  };

  private listeners: Set<(state: QuotaState) => void> = new Set();
  private hasLoggedExhaustion = false;

  constructor() {
    // Load persisted state from localStorage
    this.loadState();
    
    // Check if cooldown has expired on initialization
    this.checkCooldownExpiry();
  }

  /**
   * Load state from localStorage
   */
  private loadState(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = parsed;
      }
    } catch (error) {
      console.error('Failed to load quota state:', error);
    }
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Failed to save quota state:', error);
    }
  }

  /**
   * Check if cooldown has expired and reset if needed
   */
  private checkCooldownExpiry(): void {
    if (this.state.isExhausted && this.state.resetTime) {
      const now = Date.now();
      if (now >= this.state.resetTime) {
        console.log('[QuotaManager] Cooldown expired, resetting quota state');
        this.reset();
      }
    }
  }

  /**
   * Mark provider as quota exhausted
   */
  setExhausted(provider: string, resetTime: number | null, errorMessage: string): void {
    // Only log once per exhaustion event
    if (!this.hasLoggedExhaustion) {
      console.error(`[QuotaManager] 🚨 ${provider} QUOTA EXHAUSTED`);
      console.error(`[QuotaManager] Reset time: ${resetTime ? new Date(resetTime).toISOString() : 'unknown'}`);
      console.error(`[QuotaManager] Error: ${errorMessage}`);
      this.hasLoggedExhaustion = true;
    }

    this.state = {
      isExhausted: true,
      exhaustedAt: Date.now(),
      resetTime,
      provider,
      errorMessage,
    };

    this.saveState();
    this.notifyListeners();
  }

  /**
   * Reset quota state (manual or after cooldown expires)
   */
  reset(): void {
    console.log('[QuotaManager] Resetting quota state');
    
    this.state = {
      isExhausted: false,
      exhaustedAt: null,
      resetTime: null,
      provider: null,
      errorMessage: null,
    };

    this.hasLoggedExhaustion = false;
    this.saveState();
    this.notifyListeners();
  }

  /**
   * Get current quota state
   */
  getState(): QuotaState {
    // Always check if cooldown expired
    this.checkCooldownExpiry();
    return { ...this.state };
  }

  /**
   * Check if provider is currently exhausted
   */
  isQuotaExhausted(): boolean {
    this.checkCooldownExpiry();
    return this.state.isExhausted;
  }

  /**
   * Subscribe to quota state changes
   */
  subscribe(listener: (state: QuotaState) => void): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[QuotaManager] Listener error:', error);
      }
    });
  }

  /**
   * Get human-readable status message
   */
  getStatusMessage(): string | null {
    if (!this.state.isExhausted) {
      return null;
    }

    if (this.state.resetTime) {
      const resetDate = new Date(this.state.resetTime);
      const hoursUntil = Math.max(0, Math.ceil((this.state.resetTime - Date.now()) / 3600000));
      
      return `${this.state.provider} daily quota exhausted. Resets at ${resetDate.toLocaleTimeString()} (${hoursUntil}h from now)`;
    }

    return `${this.state.provider} daily quota exhausted. Please wait for quota reset.`;
  }
}

// Singleton instance
export const quotaManager = new QuotaManager();
