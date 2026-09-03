import * as SecureStore from "expo-secure-store";
import NetInfo from "@react-native-community/netinfo";
import { CameraView, useCameraPermissions } from "expo-camera";
import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  Modal,
  Pressable,
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
  downloadDocument,
  openOfflineDocument,
  syncDocumentCatalog,
} from "../src/document-client";
import {
  createLocalRecord,
  deleteLocalRecord,
  initializeLocalDatabase,
  listLocalRecords,
  listLocalDocuments,
  LocalDocument,
  LocalRecord,
  updateLocalRecord,
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
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [view, setView] = useState<"records" | "documents">("documents");
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingRecord, setEditingRecord] = useState<LocalRecord | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
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
      const documentCount = await syncDocumentCatalog();
      setRecords(await listLocalRecords());
      setDocuments(await listLocalDocuments());
      setSyncMessage(
        result.total === 0
          ? `Tudo sincronizado · ${documentCount} documento(s)`
          : `${result.synced} de ${result.total} registro(s) · ${documentCount} documento(s)`,
      );
    } catch (syncError) {
      setSyncMessage(
        syncError instanceof Error
          ? `${syncError.message}. Os dados locais continuam disponíveis.`
          : "Sem conexão. Os dados locais continuam disponíveis.",
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
      setDocuments(await listLocalDocuments());
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
        description: description.trim() || null,
        latitude,
        longitude,
        photoUri,
        capturedAt: new Date().toISOString(),
      };
      await createLocalRecord(record);
      setRecords(await listLocalRecords());
      setTitle("");
      setDescription("");
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
  function beginEditing(record: LocalRecord) {
    if (record.syncStatus === "CONFLICT") {
      setError("Este registro tem um conflito pendente de resolução.");
      return;
    }
    setEditingRecord(record);
    setEditTitle(record.title);
    setEditDescription(record.description ?? "");
    setError("");
  }
  async function saveEdit() {
    if (!editingRecord || !editTitle.trim()) {
      setError("Informe um título para o registro.");
      return;
    }
    try {
      await updateLocalRecord(
        editingRecord.id,
        editTitle.trim(),
        editDescription.trim() || null,
      );
      setRecords(await listLocalRecords());
      setEditingRecord(null);
      setError("");
      void syncNow();
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "Não foi possível editar o registro.",
      );
    }
  }
  function requestDelete(record: LocalRecord) {
    if (record.syncStatus === "CONFLICT") {
      setError("Este registro tem um conflito pendente de resolução.");
      return;
    }
    Alert.alert(
      "Excluir registro?",
      `O registro “${record.title}” será removido deste dispositivo e da sincronização.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => void confirmDelete(record),
        },
      ],
    );
  }
  async function confirmDelete(record: LocalRecord) {
    try {
      const unusedPhotoUri = await deleteLocalRecord(record.id);
      if (unusedPhotoUri)
        await FileSystem.deleteAsync(unusedPhotoUri, {
          idempotent: true,
        }).catch(() => undefined);
      setRecords(await listLocalRecords());
      setError("");
      void syncNow();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Não foi possível excluir o registro.",
      );
    }
  }
  async function handleDocumentDownload(document: LocalDocument) {
    setDocumentBusyId(document.id);
    setError("");
    try {
      setDocuments(await downloadDocument(document));
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Não foi possível baixar o documento.",
      );
    } finally {
      setDocumentBusyId(null);
    }
  }
  async function handleDocumentOpen(document: LocalDocument) {
    setDocumentBusyId(document.id);
    setError("");
    try {
      await openOfflineDocument(document);
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Não foi possível abrir o documento.",
      );
    } finally {
      setDocumentBusyId(null);
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
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Olá, {profile.name}</Text>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, view === "documents" && styles.activeTab]}
            onPress={() => setView("documents")}
          >
            <Text
              style={
                view === "documents" ? styles.activeTabText : styles.tabText
              }
            >
              Documentos
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, view === "records" && styles.activeTab]}
            onPress={() => setView("records")}
          >
            <Text
              style={view === "records" ? styles.activeTabText : styles.tabText}
            >
              Registros
            </Text>
          </Pressable>
        </View>

        {view === "records" ? (
          <>
            <Text style={styles.text}>Novo registro offline</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Título do registro"
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Descrição (opcional)"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
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
            <Text style={styles.subtitle}>Registros locais</Text>
            {records.map((record) => (
              <View style={styles.record} key={record.id}>
                <Text style={styles.recordTitle}>{record.title}</Text>
                {record.description ? (
                  <Text style={styles.recordDescription}>
                    {record.description}
                  </Text>
                ) : null}
                <Text style={styles.muted}>
                  {record.syncStatus} ·{" "}
                  {new Date(record.capturedAt).toLocaleString()}
                </Text>
                <View style={styles.recordActions}>
                  <Button
                    title="Editar"
                    disabled={record.syncStatus === "CONFLICT"}
                    onPress={() => beginEditing(record)}
                  />
                  <Button
                    title="Excluir"
                    color="#a21d22"
                    disabled={record.syncStatus === "CONFLICT"}
                    onPress={() => requestDelete(record)}
                  />
                </View>
              </View>
            ))}
            <Modal
              visible={editingRecord !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setEditingRecord(null)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.editModal}>
                  <Text style={styles.subtitle}>Editar registro</Text>
                  <TextInput
                    style={styles.input}
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder="Título do registro"
                  />
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Descrição (opcional)"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <View style={styles.modalActions}>
                    <Button
                      title="Cancelar"
                      color="#6b7770"
                      onPress={() => setEditingRecord(null)}
                    />
                    <Button
                      title="Salvar alterações"
                      onPress={() => void saveEdit()}
                    />
                  </View>
                </View>
              </View>
            </Modal>
          </>
        ) : (
          <>
            <Text style={styles.text}>Documentos para consulta offline</Text>
            {documents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.muted}>
                  Nenhum documento disponível. Sincronize quando estiver
                  conectado.
                </Text>
              </View>
            ) : null}
            {documents.map((document) => {
              const hasUpdate =
                !!document.localUri &&
                document.downloadedChecksum !== document.checksumSha256;
              return (
                <View style={styles.documentCard} key={document.id}>
                  <View style={styles.documentHeading}>
                    <View style={styles.documentTitle}>
                      <Text style={styles.documentName}>{document.name}</Text>
                      <Text style={styles.muted}>
                        v{document.version} ·{" "}
                        {Math.max(1, Math.round(document.sizeBytes / 1024))} KB
                      </Text>
                    </View>
                    <Text
                      style={
                        hasUpdate ? styles.updateStatus : styles.downloadStatus
                      }
                    >
                      {hasUpdate
                        ? "Atualização disponível"
                        : document.localUri
                          ? "Salvo offline"
                          : "Disponível"}
                    </Text>
                  </View>
                  <Button
                    title={
                      documentBusyId === document.id
                        ? "Aguarde…"
                        : hasUpdate
                          ? "Atualizar arquivo"
                          : document.localUri
                            ? "Baixar novamente"
                            : "Baixar para uso offline"
                    }
                    disabled={documentBusyId === document.id}
                    onPress={() => void handleDocumentDownload(document)}
                  />
                  {document.localUri ? (
                    <Button
                      title="Abrir arquivo offline"
                      disabled={documentBusyId === document.id}
                      onPress={() => void handleDocumentOpen(document)}
                    />
                  ) : null}
                </View>
              );
            })}
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title={syncing ? "Sincronizando…" : "Sincronizar agora"}
          disabled={syncing}
          onPress={() => void syncNow()}
        />
        {syncMessage ? <Text style={styles.muted}>{syncMessage}</Text> : null}
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
  contentContainer: {
    flexGrow: 1,
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  title: { fontSize: 30, fontWeight: "700", color: "#193126" },
  text: { fontSize: 16, color: "#496052" },
  input: {
    borderColor: "#b4c5b8",
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
    padding: 12,
  },
  multilineInput: { minHeight: 82 },
  error: { color: "#a21d22" },
  subtitle: { fontSize: 20, fontWeight: "700", marginTop: 18 },
  record: { backgroundColor: "#edf3ed", borderRadius: 8, padding: 12, gap: 7 },
  recordTitle: { color: "#193126", fontSize: 16, fontWeight: "700" },
  recordDescription: { color: "#496052", lineHeight: 20 },
  recordActions: { flexDirection: "row", gap: 8, marginTop: 5 },
  muted: { color: "#496052", fontSize: 12 },
  photo: { width: "100%", height: 200, borderRadius: 8 },
  tabs: {
    backgroundColor: "#e4ebe6",
    borderRadius: 10,
    flexDirection: "row",
    padding: 4,
  },
  tab: { alignItems: "center", borderRadius: 7, flex: 1, padding: 10 },
  activeTab: { backgroundColor: "#285d39" },
  tabText: { color: "#496052", fontWeight: "600" },
  activeTabText: { color: "white", fontWeight: "700" },
  emptyCard: { backgroundColor: "#f1f4f1", borderRadius: 8, padding: 18 },
  documentCard: {
    backgroundColor: "#edf3ed",
    borderRadius: 10,
    gap: 10,
    padding: 14,
  },
  documentHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  documentTitle: { flex: 1, gap: 3 },
  documentName: { color: "#193126", fontSize: 16, fontWeight: "700" },
  downloadStatus: { color: "#285d39", fontSize: 11, fontWeight: "700" },
  updateStatus: { color: "#9a6200", fontSize: 11, fontWeight: "700" },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(10, 28, 19, 0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  editModal: {
    backgroundColor: "white",
    borderRadius: 14,
    gap: 12,
    padding: 20,
    width: "100%",
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 4,
  },
  camera: { flex: 1 },
  cameraControls: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingBottom: 50,
  },
});
