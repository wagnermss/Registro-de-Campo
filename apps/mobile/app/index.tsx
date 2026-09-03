import * as SecureStore from "expo-secure-store";
import NetInfo from "@react-native-community/netinfo";
import { CameraView, useCameraPermissions } from "expo-camera";
import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  authenticatedFetch,
  clearSession,
  saveSession,
  sessionKeys,
} from "../src/auth-session";
import { API_URL } from "../src/config";
import {
  createLocalRecord,
  initializeLocalDatabase,
  listLocalRecords,
  LocalRecord,
} from "../src/local-db";
import { syncPendingRecords } from "../src/sync-client";

type Profile = { name: string; email: string; role: string };

export default function HomeScreen() {
  const [email, setEmail] = useState("admin@registro.local");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [title, setTitle] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const syncingRef = useRef(false);
  useEffect(() => {
    void restore();
  }, []);
  useEffect(() => {
    if (!profile) return;
    return NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false)
        void syncNow();
    });
  }, [profile]);

  async function syncNow() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await syncPendingRecords();
      setRecords(await listLocalRecords());
      setSyncMessage(
        result.total === 0
          ? "Tudo sincronizado"
          : `${result.synced} de ${result.total} registro(s) sincronizado(s)`,
      );
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }
  async function restore() {
    try {
      await initializeLocalDatabase();
      setRecords(await listLocalRecords());
      const savedProfile = await SecureStore.getItemAsync(sessionKeys.profile);
      if (savedProfile) setProfile(JSON.parse(savedProfile));
      void authenticatedFetch("/auth/me")
        .then(async (r) => {
          if (r.ok) {
            const user = await r.json();
            setProfile(user);
            await SecureStore.setItemAsync(
              sessionKeys.profile,
              JSON.stringify(user),
            );
          }
        })
        .catch(() => undefined);
    } catch {
      setError("Não foi possível abrir os registros locais.");
    } finally {
      setLoading(false);
    }
  }
  async function login() {
    setError("");
    try {
      const r = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, deviceName: "mobile" }),
      });
      if (!r.ok) throw new Error();
      const s = await r.json();
      await saveSession(s);
      setProfile(s.user);
    } catch {
      setError("E-mail ou senha inválidos.");
    }
  }
  async function logout() {
    await authenticatedFetch("/auth/logout", { method: "POST" }).catch(
      () => undefined,
    );
    await clearSession();
    setProfile(null);
  }
  async function captureLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setError("Permita a localização para registrar a coordenada.");
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    setLatitude(position.coords.latitude);
    setLongitude(position.coords.longitude);
  }
  async function saveRecord() {
    if (!title.trim()) {
      setError("Informe um título para o registro.");
      return;
    }
    if (latitude === null || longitude === null) {
      setError("Capture a localização antes de salvar.");
      return;
    }
    try {
      const record = {
        id: randomUUID(),
        title: title.trim(),
        latitude,
        longitude,
        photoUri,
        capturedAt: new Date().toISOString(),
      };
      await createLocalRecord(record);
      setRecords(await listLocalRecords());
      setTitle("");
      setLatitude(null);
      setLongitude(null);
      setPhotoUri(null);
      setError("");
      void syncNow();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o registro local.",
      );
    }
  }
  async function capturePhoto() {
    try {
      const photo = await cameraRef.current?.takePictureAsync();
      if (!photo?.uri || !FileSystem.documentDirectory) return;
      const directory = `${FileSystem.documentDirectory}record-photos/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const permanentUri = `${directory}${randomUUID()}.jpg`;
      await FileSystem.copyAsync({ from: photo.uri, to: permanentUri });
      setPhotoUri(permanentUri);
      setCameraVisible(false);
    } catch {
      setError("Não foi possível armazenar a foto.");
      setCameraVisible(false);
    }
  }
  if (loading)
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  if (cameraVisible)
    return (
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        <View style={styles.cameraControls}>
          <Button title="Cancelar" onPress={() => setCameraVisible(false)} />
          <Button title="Fotografar" onPress={() => void capturePhoto()} />
        </View>
      </CameraView>
    );
  if (profile)
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Olá, {profile.name}</Text>
        <Text style={styles.text}>Novo registro offline</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Título do registro"
        />
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : null}
        <Button
          title={photoUri ? "Refazer foto" : "Capturar foto"}
          onPress={() => {
            if (cameraPermission?.granted) setCameraVisible(true);
            else
              void requestCameraPermission().then((result) =>
                result.granted
                  ? setCameraVisible(true)
                  : setError("Permita a câmera para capturar fotos."),
              );
          }}
        />
        <Button
          title={
            latitude === null
              ? "Capturar localização"
              : `Localização: ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}`
          }
          onPress={() => void captureLocation()}
        />
        <Button
          title="Salvar no dispositivo"
          onPress={() => void saveRecord()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.subtitle}>Registros locais</Text>
        <Button
          title={syncing ? "Sincronizando…" : "Sincronizar agora"}
          disabled={syncing}
          onPress={() => void syncNow()}
        />
        {syncMessage ? <Text style={styles.muted}>{syncMessage}</Text> : null}
        {records.map((record) => (
          <View style={styles.record} key={record.id}>
            <Text>{record.title}</Text>
            <Text style={styles.muted}>
              {record.syncStatus} ·{" "}
              {new Date(record.capturedAt).toLocaleString()}
            </Text>
          </View>
        ))}
        <Button title="Sair" onPress={() => void logout()} />
      </ScrollView>
    );
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Registro de Campo</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="E-mail"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Senha"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title="Entrar"
        disabled={!password}
        onPress={() => void login()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 30, fontWeight: "700", color: "#193126" },
  text: { fontSize: 16, color: "#496052" },
  input: {
    borderColor: "#b4c5b8",
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
    padding: 12,
  },
  error: { color: "#a21d22" },
  subtitle: { fontSize: 20, fontWeight: "700", marginTop: 18 },
  record: { backgroundColor: "#edf3ed", borderRadius: 8, padding: 12, gap: 4 },
  muted: { color: "#496052", fontSize: 12 },
  photo: { width: "100%", height: 200, borderRadius: 8 },
  camera: { flex: 1 },
  cameraControls: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingBottom: 50,
  },
});
