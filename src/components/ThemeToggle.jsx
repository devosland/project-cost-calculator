/**
 * Dark / light mode toggle button. Applies the 'dark' class to
 * <html> (document.documentElement) which activates Tailwind's dark-mode
 * variant. The chosen theme is persisted in localStorage under the 'theme'
 * key and read back by App.jsx on mount so the preference survives page
 * reloads. Initialises from localStorage, falling back to the OS colour
 * scheme preference via prefers-color-scheme media query.
 */
import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from './ui/button';

/**
 * Reads the initial theme from localStorage; falls back to the OS dark-mode
 * preference if no stored value is found.
 * @returns {'dark'|'light'}
 */
function getInitialTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Renders a Sun/Moon icon button that toggles and persists the app theme. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', next);
  };

  return (
    <Button variant="ghost" size="sm" onClick={toggleTheme} title="Toggle theme">
      {theme === 'dark' ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </Button>
  );
}
