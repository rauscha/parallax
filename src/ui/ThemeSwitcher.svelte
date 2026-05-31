<script lang="ts">
  import { themeStore, THEMES, setTheme, type ThemeId } from "../state/theme";

  let current = $state<ThemeId>(themeStore.get());
  themeStore.subscribe((v) => { current = v; });
</script>

<div class="theme-switcher" role="group" aria-label="Color theme">
  {#each THEMES as t (t.id)}
    <button
      class="chip"
      class:active={current === t.id}
      aria-pressed={current === t.id}
      title={t.tagline}
      onclick={() => setTheme(t.id)}
    >
      <span class="marker" aria-hidden="true">{current === t.id ? "●" : "○"}</span>
      {t.name}
    </button>
  {/each}
</div>

<style>
  .theme-switcher {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: var(--hairline-w) solid var(--hairline);
  }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-transform: var(--label-case);
    letter-spacing: var(--label-tracking);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    transition: color var(--t-fast), background var(--t-fast);
  }
  .chip:hover { color: var(--text); }
  .chip .marker {
    font-size: 0.7em;
    color: inherit;
  }
  /* Active uses both color AND a filled dot + bold weight, so the state is
     still readable in greyscale (accessibility for colorblind users). */
  .chip.active {
    color: var(--bg);
    background: var(--signal);
    font-weight: 600;
  }
</style>
