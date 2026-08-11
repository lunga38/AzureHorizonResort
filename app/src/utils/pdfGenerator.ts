import html2pdf from 'html2pdf.js';

interface PdfOptions {
  filename?: string;
  margin?: [number, number, number, number];
}

export const generatePDF = async (element: HTMLElement, filename: string, options?: PdfOptions) => {
  const defaultOptions = {
    margin: [0.5, 0.5, 0.5, 0.5] as [number, number, number, number],
    filename: filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, letterRendering: true, useCORS: true },
    jsPDF: { unit: 'in' as const, format: 'a4' as const, orientation: 'portrait' as const }
  };

  const mergedOptions = { ...defaultOptions, ...options };
  await html2pdf().set(mergedOptions).from(element).save();
};

export const generatePDFFromHTML = async (html: string, filename: string) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const element = iframe.contentWindow?.document?.body;
    if (element) {
      const opt = {
        margin: [0.5, 0.5, 0.5, 0.5] as [number, number, number, number],
        filename: filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, letterRendering: true, useCORS: true },
        jsPDF: { unit: 'in' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };
      await html2pdf().set(opt).from(element).save();
    }
    document.body.removeChild(iframe);
  } else {
    document.body.removeChild(iframe);
    throw new Error('Could not generate PDF');
  }
};

export const getProfessionalPDFHTML = (content: {
  title: string;
  guestName: string;
  details: Array<{ label: string; value: string }>;
  items?: Array<{ name: string; quantity: number; price: number; subtotal: number }>;
  subtotal?: number;
  tax?: number;
  total: number;
  footer?: string;
}) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${content.title}</title>
        <meta charset="utf-8">
      </head>
      <body>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #333333;
            padding: 40px;
            font-size: 14px;
            line-height: 1.6;
          }
          .document {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #e0e0e0;
            padding: 40px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #1e3a5f;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .header-left {
            display: flex;
            flex-direction: column;
          }
          .hotel-name {
            font-size: 24px;
            font-weight: 700;
            color: #1e3a5f;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          .hotel-tagline {
            font-size: 12px;
            color: #c9a227;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-top: 4px;
          }
          .hotel-contact {
            margin-top: 15px;
            font-size: 12px;
            color: #666;
            line-height: 1.4;
          }
          .header-right {
            text-align: right;
          }
          .doc-title {
            font-size: 28px;
            font-weight: 300;
            color: #c9a227;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .doc-date {
            font-size: 12px;
            color: #888;
          }
          .details-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            background: #f8f9fa;
            padding: 20px;
            border-left: 4px solid #1e3a5f;
          }
          .details-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px 40px;
          }
          .detail-item {
            display: flex;
            flex-direction: column;
          }
          .detail-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
          }
          .detail-value {
            font-size: 14px;
            font-weight: 500;
            color: #111;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th {
            background: #1e3a5f;
            color: #ffffff;
            padding: 12px 15px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          td {
            padding: 12px 15px;
            border-bottom: 1px solid #eeeeee;
            font-size: 14px;
          }
          tr:nth-child(even) td {
            background: #fafafa;
          }
          .totals-wrapper {
            display: flex;
            justify-content: flex-end;
          }
          .totals-table {
            width: 350px;
            border-collapse: collapse;
          }
          .totals-table td {
            padding: 10px 15px;
            border-bottom: 1px solid #eeeeee;
            font-size: 14px;
          }
          .totals-table .total-label {
            text-align: left;
            color: #666;
          }
          .totals-table .total-amount {
            text-align: right;
            font-weight: 500;
          }
          .grand-total td {
            background: #f8f9fa;
            border-top: 2px solid #1e3a5f;
            border-bottom: none;
            padding: 15px;
          }
          .grand-total .total-label {
            font-size: 16px;
            font-weight: 700;
            color: #1e3a5f;
          }
          .grand-total .total-amount {
            font-size: 18px;
            font-weight: 700;
            color: #1e3a5f;
          }
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            text-align: center;
            font-size: 12px;
            color: #888;
          }
        </style>
        <div class="document">
          <div class="header">
            <div class="header-left">
              <div class="hotel-name">AZURE HORIZON</div>
              <div class="hotel-tagline">Resort & Spa</div>
              <div class="hotel-contact">
                123 Ocean Drive, Coastal City<br>
                reservations@azurehorizon.com<br>
                +27 (0)21 555 0100<br>
                VAT: 4200012345
              </div>
            </div>
            <div class="header-right">
              <div class="doc-title">${content.title}</div>
              <div class="doc-date">Generated: ${new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>
          </div>
          
          <div class="details-section">
            <div class="details-grid">
              ${content.details.map(detail => `
                <div class="detail-item">
                  <span class="detail-label">${detail.label}</span>
                  <span class="detail-value">${detail.value}</span>
                </div>
              `).join('')}
            </div>
          </div>
          
          ${content.items && content.items.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th style="width: 50%;">Description</th>
                  <th style="width: 15%; text-align: center;">Qty</th>
                  <th style="width: 15%; text-align: right;">Unit Price</th>
                  <th style="width: 20%; text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${content.items.map(item => `
                  <tr>
                    <td>${item.name}</td>
                    <td style="text-align: center;">${item.quantity}</td>
                    <td style="text-align: right;">R ${item.price.toFixed(2)}</td>
                    <td style="text-align: right;">R ${item.subtotal.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="totals-wrapper">
              <table class="totals-table">
                ${content.subtotal !== undefined ? `<tr><td class="total-label">Subtotal</td><td class="total-amount">R ${content.subtotal.toFixed(2)}</td></tr>` : ''}
                ${content.tax !== undefined ? `<tr><td class="total-label">VAT (10%)</td><td class="total-amount">R ${content.tax.toFixed(2)}</td></tr>` : ''}
                <tr class="grand-total"><td class="total-label">TOTAL AMOUNT</td><td class="total-amount">R ${content.total.toFixed(2)}</td></tr>
              </table>
            </div>
          ` : `
            <div class="totals-wrapper">
              <table class="totals-table">
                <tr class="grand-total"><td class="total-label">TOTAL PAID</td><td class="total-amount">R ${content.total.toFixed(2)}</td></tr>
              </table>
            </div>
          `}
          
          <div class="footer">
            <p>${content.footer || 'Thank you for choosing Azure Horizon Resort!'}</p>
            <p style="margin-top: 5px; opacity: 0.7;">This is a system-generated document and is valid without signature.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};