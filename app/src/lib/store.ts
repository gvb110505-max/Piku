// 토큰 저장. 네이티브는 SecureStore, 웹은 localStorage로 갈라진다.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "piku_token";

export async function saveToken(token: string) {
  if (Platform.OS === "web") { try { localStorage.setItem(KEY, token); } catch {} return; }
  await SecureStore.setItemAsync(KEY, token);
}
export async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") { try { return localStorage.getItem(KEY); } catch { return null; } }
  return SecureStore.getItemAsync(KEY);
}
export async function clearToken() {
  if (Platform.OS === "web") { try { localStorage.removeItem(KEY); } catch {} return; }
  await SecureStore.deleteItemAsync(KEY);
}
