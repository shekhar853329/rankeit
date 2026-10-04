import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnInit,
  PLATFORM_ID,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface TickerColumn {
  id: string;
  state: 'idle' | 'rolling' | 'entering' | 'leaving';
  finalChar: string;
  chars: string[];
  transform: string;
  animating: boolean;
  delay: number;
}

@Component({
  selector: 'app-number-ticker',
  standalone: true,
  templateUrl: './number-ticker.component.html',
  styleUrl: './number-ticker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NumberTickerComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  /** Target numeric value to display. */
  readonly value = input.required<number>();

  /** Transition duration in milliseconds (slowed for smooth, deliberate visibility). */
  readonly duration = input<number>(1100);

  /** Stagger delay in milliseconds per column (from right to left). */
  readonly stagger = input<number>(40);

  /** Accessible label prefix (e.g. 'Online users: ') */
  readonly label = input<string>('');

  protected readonly displayColumns = signal<TickerColumn[]>([]);

  private previousValue: number | null = null;
  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;

  constructor() {
    // Watch for value changes
    effect(() => {
      const val = this.value();
      if (!this.isBrowser) {
        this.displayColumns.set(this.buildStaticColumns(val));
        return;
      }

      if (this.previousValue === null) {
        // Initial setup on client
        this.previousValue = val;
        this.displayColumns.set(this.buildStaticColumns(val));
        return;
      }

      if (this.previousValue !== val) {
        const oldVal = this.previousValue;
        this.previousValue = val;
        this.animateTransition(oldVal, val);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.clearPendingTimers();
    });
  }

  ngOnInit(): void {
    if (!this.isBrowser) {
      this.displayColumns.set(this.buildStaticColumns(this.value()));
    }
  }

  private clearPendingTimers(): void {
    if (this.animationTimer !== null) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Builds non-animating static columns for a given value (for initial render & SSR).
   */
  private buildStaticColumns(num: number): TickerColumn[] {
    const safeNum = Math.max(0, Math.round(num));
    const digits = safeNum.toString().split('');
    const total = digits.length;

    return digits.map((char, index) => {
      const posFromRight = total - 1 - index;
      return {
        id: `col-${posFromRight}`,
        state: 'idle',
        finalChar: char,
        chars: [char],
        transform: 'translateY(0%)',
        animating: false,
        delay: 0,
      };
    });
  }

  /**
   * Sets up and triggers the rolling digit animation between oldVal and newVal.
   */
  private animateTransition(oldVal: number, newVal: number): void {
    this.clearPendingTimers();

    const dir: 'up' | 'down' = newVal >= oldVal ? 'up' : 'down';
    const oldStr = Math.max(0, Math.round(oldVal)).toString();
    const newStr = Math.max(0, Math.round(newVal)).toString();
    const oldDigits = oldStr.split('');
    const newDigits = newStr.split('');
    const maxLen = Math.max(oldDigits.length, newDigits.length);

    const initialColumns: TickerColumn[] = [];
    const targetTransforms: Array<{ id: string; transform: string }> = [];

    for (let i = 0; i < maxLen; i++) {
      const posFromRight = maxLen - 1 - i;
      const oldDigitIndex = oldDigits.length - 1 - posFromRight;
      const newDigitIndex = newDigits.length - 1 - posFromRight;

      const oldChar = oldDigitIndex >= 0 ? oldDigits[oldDigitIndex] : '';
      const newChar = newDigitIndex >= 0 ? newDigits[newDigitIndex] : '';
      const colId = `col-${posFromRight}`;
      const delay = posFromRight * this.stagger();

      if (!oldChar && newChar) {
        // Newly appearing digit column (e.g. 9 -> 10)
        initialColumns.push({
          id: colId,
          state: 'entering',
          finalChar: newChar,
          chars: [newChar],
          transform: dir === 'up' ? 'translateY(60%)' : 'translateY(-60%)',
          animating: false,
          delay,
        });
        targetTransforms.push({ id: colId, transform: 'translateY(0%)' });
      } else if (oldChar && !newChar) {
        // Disappearing digit column (e.g. 10 -> 9)
        initialColumns.push({
          id: colId,
          state: 'leaving',
          finalChar: '',
          chars: [oldChar],
          transform: 'translateY(0%)',
          animating: false,
          delay,
        });
        targetTransforms.push({
          id: colId,
          transform: dir === 'up' ? 'translateY(-60%)' : 'translateY(60%)',
        });
      } else if (oldChar === newChar) {
        // Identical digit, stays stationary
        initialColumns.push({
          id: colId,
          state: 'idle',
          finalChar: newChar,
          chars: [newChar],
          transform: 'translateY(0%)',
          animating: false,
          delay: 0,
        });
        targetTransforms.push({ id: colId, transform: 'translateY(0%)' });
      } else {
        // Digit is changing: build rolling sequence
        const dFrom = parseInt(oldChar, 10);
        const dTo = parseInt(newChar, 10);
        const chars: string[] = [];

        if (dir === 'up') {
          let curr = dFrom;
          chars.push(String(curr));
          while (curr !== dTo) {
            curr = (curr + 1) % 10;
            chars.push(String(curr));
            if (chars.length > 10) break;
          }
          const pct = ((chars.length - 1) * 100) / chars.length;
          initialColumns.push({
            id: colId,
            state: 'rolling',
            finalChar: newChar,
            chars,
            transform: 'translateY(0%)',
            animating: false,
            delay,
          });
          targetTransforms.push({
            id: colId,
            transform: `translateY(-${pct.toFixed(3)}%)`,
          });
        } else {
          let curr = dTo;
          chars.push(String(curr));
          while (curr !== dFrom) {
            curr = (curr + 1) % 10;
            chars.push(String(curr));
            if (chars.length > 10) break;
          }
          const pct = ((chars.length - 1) * 100) / chars.length;
          initialColumns.push({
            id: colId,
            state: 'rolling',
            finalChar: newChar,
            chars,
            transform: `translateY(-${pct.toFixed(3)}%)`,
            animating: false,
            delay,
          });
          targetTransforms.push({
            id: colId,
            transform: 'translateY(0%)',
          });
        }
      }
    }

    // Step 1: Render starting frames
    this.displayColumns.set(initialColumns);

    // Step 2: Next frame -> animate to target transforms
    this.ngZone.runOutsideAngular(() => {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = requestAnimationFrame(() => {
          this.ngZone.run(() => {
            const transformMap = new Map(targetTransforms.map((t) => [t.id, t.transform]));
            this.displayColumns.update((cols) =>
              cols.map((col) => ({
                ...col,
                transform: transformMap.get(col.id) ?? col.transform,
                animating: col.state !== 'idle',
              }))
            );

            // Step 3: Cleanup when animation completes
            const maxDelay = (maxLen - 1) * this.stagger();
            const totalDuration = this.duration() + maxDelay + 50;

            this.animationTimer = setTimeout(() => {
              this.displayColumns.update((cols) =>
                cols
                  .filter((col) => col.state !== 'leaving')
                  .map((col) => ({
                    ...col,
                    state: 'idle',
                    chars: [col.finalChar],
                    transform: 'translateY(0%)',
                    animating: false,
                    delay: 0,
                  }))
              );
              this.animationTimer = null;
            }, totalDuration);
          });
        });
      });
    });
  }
}
