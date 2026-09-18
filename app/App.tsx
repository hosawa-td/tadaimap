import React from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "./src/state/AppContext";
import StartScreen from "./src/screens/StartScreen";
import CreateGroupScreen from "./src/screens/CreateGroupScreen";
import JoinGroupScreen from "./src/screens/JoinGroupScreen";
import RegisterHomeScreen from "./src/screens/RegisterHomeScreen";
import HomeScreen from "./src/screens/HomeScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { colors } from "./src/theme/tokens";

export type RootStackParamList = {
  Start: undefined;
  CreateGroup: undefined;
  JoinGroup: undefined;
  RegisterHome: { fromSettings?: boolean } | undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Settings: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

function MainNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <MainTab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: "ホーム" }} />
      <MainTab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: "設定" }} />
    </MainTab.Navigator>
  );
}

function RootNavigator() {
  const { ready, hasGroup } = useApp();
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }
  return (
    <RootStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={hasGroup ? "Main" : "Start"}
    >
      <RootStack.Screen name="Start" component={StartScreen} />
      <RootStack.Screen name="CreateGroup" component={CreateGroupScreen} />
      <RootStack.Screen name="JoinGroup" component={JoinGroupScreen} />
      <RootStack.Screen name="RegisterHome" component={RegisterHomeScreen} />
      <RootStack.Screen name="Main" component={MainNavigator} />
    </RootStack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}
