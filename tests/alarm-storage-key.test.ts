/**
 * alarm-storage-key.test.ts
 *
 * O expo-alarm-module guarda os alarmes agendados num SharedPreferences cujo
 * nome de arquivo, no original, era o MESMO string do notification_channel_id.
 *
 * Isso é uma armadilha: as configurações de um NotificationChannel são
 * imutáveis depois de criado, então mudar comportamento de canal (a vibração,
 * no nosso caso) OBRIGA a trocar o id. Com os dois acoplados, trocar o id
 * trocaria também o arquivo de preferências — e todo alarme já agendado
 * sumiria da vista do módulo, silenciosamente, em quem atualizasse o app.
 *
 * Por isso o patch fixa o nome histórico ("expo-alarm-module") como literal.
 * Este teste existe para que ninguém "limpe" isso de volta para o R.string.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const patch = readFileSync(
  join(__dirname, "..", "patches", "expo-alarm-module.patch"),
  "utf8"
);

/** Só as linhas ADICIONADAS pelo patch (o que de fato vai para o build). */
const added = patch
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .map((l) => l.slice(1))
  .join("\n");

describe("armazenamento dos alarmes nativos", () => {
  it("usa um nome de arquivo FIXO, não o id do canal de notificação", () => {
    expect(added).toMatch(
      /getSharedPreferences\(\s*"expo-alarm-module"\s*,\s*Context\.MODE_PRIVATE\s*\)/
    );
  });

  it("não volta a derivar o nome do arquivo de R.string.notification_channel_id", () => {
    // A linha original era:
    //   String fileKey = context.getResources().getString(R.string.notification_channel_id);
    // ...dentro de getSharedPreferences. Se ela reaparecer entre as adições,
    // o acoplamento voltou.
    expect(added).not.toMatch(
      /String\s+fileKey\s*=.*R\.string\.notification_channel_id/
    );
  });

  it("o id do canal mudou (era o gatilho do problema)", () => {
    expect(added).toMatch(/vigora-alarme-v2/);
  });
});
