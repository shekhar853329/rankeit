import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { AppColors, Colors, ThemeType } from '../constants/theme';

const STORAGE_KEY_THEME = '@rankup_theme_mode';

interface ThemeContextType {
  theme: ThemeType;
  isDark: boolean;
  colors: AppColors;
  toggleTheme: () => void;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  colors: Colors.light,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeType>('light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_THEME).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
      } else if (systemScheme === 'dark') {
        setThemeState('dark');
      }
    });
  }, [systemScheme]);

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    AsyncStorage.setItem(STORAGE_KEY_THEME, newTheme).catch(() => {});
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  const isDark = theme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useAppTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
