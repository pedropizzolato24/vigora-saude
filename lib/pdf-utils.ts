import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { AnamnesesData } from './app-context';

/**
 * Generate a PDF from Anamnesis data
 */
export async function generateAnamnesisPDF(anamnesis: AnamnesesData): Promise<string> {
  try {
    // Create HTML content for the PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              line-height: 1.6;
              color: #333;
            }
            h1 {
              text-align: center;
              color: #0066CC;
              border-bottom: 2px solid #0066CC;
              padding-bottom: 10px;
            }
            h2 {
              color: #0066CC;
              margin-top: 20px;
              border-left: 4px solid #0066CC;
              padding-left: 10px;
            }
            .section {
              margin-bottom: 20px;
              page-break-inside: avoid;
            }
            .field {
              margin-bottom: 10px;
            }
            .label {
              font-weight: bold;
              color: #0066CC;
            }
            .value {
              margin-left: 10px;
              padding: 8px;
              background-color: #f5f5f5;
              border-radius: 4px;
            }
            .list-item {
              margin-left: 20px;
              padding: 5px 0;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 12px;
              color: #999;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <h1>Ficha Médica - Anamnese</h1>
          
          <div class="section">
            <h2>Informações Pessoais</h2>
            <div class="field">
              <span class="label">Nome:</span>
              <div class="value">${anamnesis.fullName || 'Não informado'}</div>
            </div>
            <div class="field">
              <span class="label">Data de Nascimento:</span>
              <div class="value">${anamnesis.birthDate || 'Não informado'}</div>
            </div>
            <div class="field">
              <span class="label">Sexo:</span>
              <div class="value">${anamnesis.gender || 'Não informado'}</div>
            </div>
          </div>

          <div class="section">
            <h2>Alergias</h2>
            <div class="value">${anamnesis.allergies || 'Nenhuma alergia registrada'}</div>
          </div>

          <div class="section">
            <h2>Medicamentos em Uso</h2>
            <div class="value">${anamnesis.medications || 'Nenhum medicamento registrado'}</div>
          </div>

          <div class="section">
            <h2>Doenças Crônicas</h2>
            <div class="value">${anamnesis.diseases || 'Nenhuma doença crônica registrada'}</div>
          </div>

          <div class="section">
            <h2>Plano de Saúde</h2>
            <div class="field">
              <span class="label">Provedor:</span>
              <div class="value">${anamnesis.healthPlanProvider || 'Não informado'}</div>
            </div>
            <div class="field">
              <span class="label">Número da Carteira:</span>
              <div class="value">${anamnesis.healthPlanNumber || 'Não informado'}</div>
            </div>
            <div class="field">
              <span class="label">Número SUS:</span>
              <div class="value">${anamnesis.susNumber || 'Não informado'}</div>
            </div>
          </div>

          <div class="footer">
            <p>Documento gerado automaticamente pelo aplicativo Vigora</p>
            <p>Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
          </div>
        </body>
      </html>
    `;

    // Convert HTML to base64 for PDF generation
    const base64HTML = Buffer.from(htmlContent).toString('base64');
    
    // Create a temporary file path
    const fileName = `Anamnese_${new Date().getTime()}.html`;
    const filePath = (FileSystem.documentDirectory || '') + fileName;
    
    // Write HTML file
    await FileSystem.writeAsStringAsync(filePath, htmlContent);
    
    return filePath;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

/**
 * Share the Anamnesis PDF
 */
export async function shareAnamnesisPDF(filePath: string): Promise<void> {
  try {
    const fileName = `Anamnese_${new Date().getTime()}.pdf`;
    
    if (!(await Sharing.isAvailableAsync())) {
      console.error('Sharing is not available on this platform');
      return;
    }

    await Sharing.shareAsync(filePath, {
      mimeType: 'application/pdf',
      dialogTitle: 'Compartilhar Ficha Médica',
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('Error sharing PDF:', error);
    throw error;
  }
}

/**
 * Export Anamnesis as HTML/PDF and share
 */
export async function exportAndShareAnamnesis(anamnesis: AnamnesesData): Promise<void> {
  try {
    const filePath = await generateAnamnesisPDF(anamnesis);
    await shareAnamnesisPDF(filePath);
  } catch (error) {
    console.error('Error exporting and sharing anamnesis:', error);
    throw error;
  }
}
