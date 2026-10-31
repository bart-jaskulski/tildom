import { Title } from "@solidjs/meta";
import {
  DatabaseSettings,
  SettingsContainer,
  SyncSettings,
  SystemSettings,
  createPreferences,
} from "@tildom/ui";
import { client } from "~/lib/db";
import { pwaInstall } from "~/lib/pwaInstall";
import {
  createSyncVault,
  disconnectSync,
  joinSyncVault,
  refreshSyncState,
  syncNow,
  syncSignals,
} from "~/lib/syncClient";
import { getSyncConfig, markSyncDirty } from "~/lib/syncState";
import { isEntryStoreReady } from "~/stores/entryStore";

export default function Settings() {
  const [prefs, setPrefs] = createPreferences();

  const handleImport = async () => {
    await markSyncDirty();
  };

  const handleReset = async () => {
    await disconnectSync();
    window.location.assign("/");
  };

  return (
    <>
      <Title>Settings | mark.tildom</Title>
      <SettingsContainer>
        <SystemSettings
          vimKeys={prefs().vimKeys}
          onVimKeysChange={(vimKeys) => setPrefs((prev) => ({ ...prev, vimKeys }))}
          pwaInstall={pwaInstall}
          appName="mark"
        />

        <SyncSettings
          signals={syncSignals}
          onSyncNow={syncNow}
          onCreateVault={createSyncVault}
          onJoinVault={joinSyncVault}
          onDisconnect={disconnectSync}
          onRefresh={refreshSyncState}
          getSyncConfig={getSyncConfig}
          ready={isEntryStoreReady()}
        />

        <DatabaseSettings
          client={client}
          filenamePrefix="mark"
          ready={isEntryStoreReady()}
          onImport={handleImport}
          onReset={handleReset}
        />
      </SettingsContainer>
    </>
  );
}
