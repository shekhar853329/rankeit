import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfirmClaimModal } from '../components/ConfirmClaimModal';
import { ModalProvider } from '../context/ModalContext';
import { SignalRProvider } from '../context/SignalRContext';
import { ThemeProvider, useAppTheme } from '../context/ThemeContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootStack() {
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="leaderboard/[categorySlug]"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="listing/[listingId]"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="rules"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="contact"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="terms"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="privacy"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="api-settings"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
      </Stack>
      <ConfirmClaimModal />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SignalRProvider>
          <ModalProvider>
            <RootStack />
          </ModalProvider>
        </SignalRProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
