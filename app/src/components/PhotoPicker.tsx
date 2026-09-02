// 판매 사진 선택.
//
// 사진은 DB에 base64로 들어가므로 보내기 전에 반드시 줄인다 —
// 폰 원본(5~10MB)을 그대로 올리면 서버가 막고, 막지 않더라도 목록이 무거워진다.
// 관리자 페이지와 같은 규격(긴 변 1200px, JPEG 82%)으로 맞췄다.
import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { C, R, T } from "@/lib/theme";
import { Api, ApiError, imageUrl } from "@/lib/api";
import { IconPlus } from "@/components/icons";

const MAX = 5;
const LONG_EDGE = 1200;
const QUALITY = 0.82;

// 웹/네이티브 모두에서 도는 축소. canvas가 없으면(네이티브) 원본을 쓰되
// picker의 quality 옵션으로 이미 한 번 줄여서 받는다.
async function shrink(uri: string): Promise<string> {
  if (typeof document === "undefined") return uri;
  return new Promise((resolve, reject) => {
    const im = new (globalThis as any).Image();
    im.crossOrigin = "anonymous";
    im.onerror = () => reject(new Error("이미지를 읽지 못했어요."));
    im.onload = () => {
      const scale = Math.min(1, LONG_EDGE / Math.max(im.width, im.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(im.width * scale);
      cv.height = Math.round(im.height * scale);
      cv.getContext("2d")!.drawImage(im, 0, 0, cv.width, cv.height);
      resolve(cv.toDataURL("image/jpeg", QUALITY));
    };
    im.src = uri;
  });
}

export function PhotoPicker({ urls, onChange }: {
  urls: string[]; onChange: (next: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick() {
    setErr(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr("사진 접근을 허용해주세요."); return; }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: QUALITY,
      allowsMultipleSelection: true, selectionLimit: MAX - urls.length,
    });
    if (r.canceled || !r.assets?.length) return;

    setBusy(true);
    try {
      const added: string[] = [];
      for (const a of r.assets.slice(0, MAX - urls.length)) {
        const data = await shrink(a.uri);
        // 네이티브에서 shrink가 원본 uri를 그대로 돌려주면 base64가 아니다 → 그 경우만 별도 처리
        const payload = data.startsWith("data:") ? data
          : `data:image/jpeg;base64,${a.base64 ?? ""}`;
        const up = await Api.uploadImage(payload);
        added.push(up.url);
      }
      onChange([...urls, ...added]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "사진을 올리지 못했어요.");
    } finally { setBusy(false); }
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={st.label}>사진 {urls.length}/{MAX}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {urls.map((u) => (
          <View key={u} style={st.thumb}>
            <Image source={{ uri: imageUrl(u) ?? u }} style={st.fill} contentFit="cover" transition={140} />
            <Pressable onPress={() => onChange(urls.filter((x) => x !== u))} style={st.remove} hitSlop={6}>
              <Text style={st.removeText}>✕</Text>
            </Pressable>
          </View>
        ))}
        {urls.length < MAX ? (
          <Pressable onPress={busy ? undefined : pick} style={[st.thumb, st.add]}>
            {busy ? <ActivityIndicator color={C.n300} size="small" />
              : <><IconPlus size={20} color={C.n300} /><Text style={st.addText}>사진</Text></>}
          </Pressable>
        ) : null}
      </ScrollView>
      <Text style={st.hint}>
        {err || "첫 번째 사진이 목록 대표로 쓰여요. 카드 앞면·뒷면·상태가 보이게 찍어주세요."}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  label: { ...T, color: C.n500, fontSize: 11.5, marginBottom: 10 },
  thumb: { width: 88, height: 112, borderRadius: R.sm, overflow: "hidden",
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  fill: { width: "100%", height: "100%" },
  add: { alignItems: "center", justifyContent: "center", gap: 5, borderStyle: "dashed", borderColor: C.lineStrong },
  addText: { ...T, color: C.n400, fontSize: 11 },
  remove: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(8,8,10,0.8)", alignItems: "center", justifyContent: "center" },
  removeText: { color: C.text, fontSize: 11, lineHeight: 13 },
  hint: { ...T, color: C.n600, fontSize: 11, lineHeight: 16, marginTop: 8 },
});
