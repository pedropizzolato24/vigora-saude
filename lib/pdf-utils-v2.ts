import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AnamnesesData } from './app-context';

/**
 * Generate HTML content for Anamnesis PDF
 */
function generateAnamnesisPDF(anamnesis: AnamnesesData): string {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Não informado';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #0066CC;
            padding-bottom: 15px;
          }
          .header h1 {
            margin: 0;
            color: #0066CC;
            font-size: 28px;
          }
          .header p {
            margin: 5px 0 0 0;
            color: #666;
            font-size: 14px;
          }
          .section {
            margin-bottom: 25px;
          }
          .section-title {
            background-color: #0066CC;
            color: white;
            padding: 10px 15px;
            margin-bottom: 10px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 4px;
          }
          .field {
            margin-bottom: 12px;
            display: flex;
            border-bottom: 1px solid #eee;
            padding-bottom: 8px;
          }
          .field-label {
            font-weight: bold;
            width: 35%;
            color: #0066CC;
          }
          .field-value {
            width: 65%;
            word-wrap: break-word;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #999;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Ficha Médica - Vigora Saúde</h1>
          <p>Documento gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>

        <div class="section">
          <div class="section-title">Informações Pessoais</div>
          <div class="field">
            <div class="field-label">Nome Completo:</div>
            <div class="field-value">${anamnesis.fullName || 'Não informado'}</div>
          </div>
          <div class="field">
            <div class="field-label">Data de Nascimento:</div>
            <div class="field-value">${formatDate(anamnesis.birthDate)}</div>
          </div>
          <div class="field">
            <div class="field-label">Gênero:</div>
            <div class="field-value">${
              anamnesis.gender === 'M'
                ? 'Masculino'
                : anamnesis.gender === 'F'
                  ? 'Feminino'
                  : 'Outro'
            }</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Histórico Médico</div>
          <div class="field">
            <div class="field-label">Alergias:</div>
            <div class="field-value">${anamnesis.allergies || 'Nenhuma informada'}</div>
          </div>
          <div class="field">
            <div class="field-label">Medicamentos em Uso:</div>
            <div class="field-value">${anamnesis.medications || 'Nenhum informado'}</div>
          </div>
          <div class="field">
            <div class="field-label">Doenças Crônicas:</div>
            <div class="field-value">${anamnesis.diseases || 'Nenhuma informada'}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Informações de Saúde</div>
          <div class="field">
            <div class="field-label">Número SUS:</div>
            <div class="field-value">${anamnesis.susNumber || 'Não informado'}</div>
          </div>
          <div class="field">
            <div class="field-label">Plano de Saúde:</div>
            <div class="field-value">${anamnesis.healthPlanProvider || 'Não informado'}</div>
          </div>
          <div class="field">
            <div class="field-label">Número do Plano:</div>
            <div class="field-value">${anamnesis.healthPlanNumber || 'Não informado'}</div>
          </div>
        </div>

        <div class="footer">
          <p>Este documento é confidencial e destina-se apenas ao uso médico.</p>
          <p>Vigora Saúde © 2026</p>
        </div>
      </body>
    </html>
  `;

  return htmlContent;
}

/**
 * Export Anamnesis to PDF and share
 */
export async function exportAnamnesisToPDF(anamnesis: AnamnesesData): Promise<boolean> {
  try {
    const htmlContent = generateAnamnesisPDF(anamnesis);

    // Generate PDF
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });

    console.log('[PDF Export] PDF generated at:', uri);

    // Check if sharing is available
    const canShare = await Sharing.isAvailableAsync();

    if (canShare) {
      // Share the PDF
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Compartilhar Ficha Médica',
        UTI: 'com.adobe.pdf',
      });
      console.log('[PDF Export] PDF shared successfully');
      return true;
    } else {
      console.warn('[PDF Export] Sharing not available on this device');
      return false;
    }
  } catch (error) {
    console.error('[PDF Export] Error exporting PDF:', error);
    throw error;
  }
}
