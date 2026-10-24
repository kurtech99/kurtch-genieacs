const ExcelJS = require('exceljs');

function applyBoxBorder(sheet, startCol, endCol, rowNum, borderColor) {
  for (let c = startCol; c <= endCol; c++) {
    const cell = sheet.getRow(rowNum).getCell(c);
    cell.border = {
      top: { style: 'thin', color: { argb: borderColor } },
      bottom: { style: 'thin', color: { argb: borderColor } },
      left: { style: 'thin', color: { argb: borderColor } },
      right: { style: 'thin', color: { argb: borderColor } }
    };
  }
}

async function generateDevicesExcel(devices, brandName = 'NOC PANEL') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${brandName} NOC Panel`;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Data ONT & Pelanggan', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 6 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  // Calculate KPIs
  const total = devices.length;
  const onlineCount = devices.filter(d => d.online).length;
  const offlineCount = total - onlineCount;
  const badRxCount = devices.filter(d => d.rx !== null && d.rx !== undefined && parseFloat(d.rx) <= -27).length;
  const totalClients = devices.reduce((sum, d) => sum + (parseInt(d.activeClients, 10) || 0), 0);
  const now = new Date();
  const formattedDate = now.toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  // Explicit Column Definitions with Generous Widths
  sheet.columns = [
    { key: 'no', width: 6 },
    { key: 'status', width: 14 },
    { key: 'name', width: 24 },
    { key: 'phone', width: 18 },
    { key: 'sn', width: 20 },
    { key: 'ssid', width: 22 },
    { key: 'password', width: 18 },
    { key: 'rx', width: 15 },
    { key: 'rxStatus', width: 14 },
    { key: 'temp', width: 14 },
    { key: 'uptime', width: 18 },
    { key: 'ip', width: 18 },
    { key: 'pppoe', width: 22 },
    { key: 'model', width: 16 },
    { key: 'clients', width: 14 }
  ];

  // ==========================================
  // ROW 1: Banner Header (Merged A1:O1)
  // ==========================================
  sheet.mergeCells('A1:O1');
  const bannerCell = sheet.getCell('A1');
  bannerCell.value = `🏢 ${brandName.toUpperCase()} NETWORK — LAPORAN REKAPITULASI ONT & PELANGGAN`;
  bannerCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  bannerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0B192C' } // Cyber Deep Navy
  };
  sheet.getRow(1).height = 36;

  // ==========================================
  // ROW 2: Subtitle & Timestamp (Merged A2:O2)
  // ==========================================
  sheet.mergeCells('A2:O2');
  const subCell = sheet.getCell('A2');
  subCell.value = `📅 Waktu Cetak: ${formattedDate} WIB   |   Sistem: ${brandName} NOC TR-069 Management Panel`;
  subCell.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  subCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }
  };
  sheet.getRow(2).height = 22;

  // ROW 3: Spacer
  sheet.getRow(3).height = 8;

  // ==========================================
  // ROW 4: KPI Mini Cards
  // ==========================================
  // Card 1: Total ONT (A4:C4)
  sheet.mergeCells('A4:C4');
  const kpi1 = sheet.getCell('A4');
  kpi1.value = `📊 TOTAL MODEM: ${total} Unit`;
  kpi1.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1D4ED8' } };
  kpi1.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  applyBoxBorder(sheet, 1, 3, 4, 'FF93C5FD');

  // Card 2: Online (D4:F4)
  sheet.mergeCells('D4:F4');
  const kpi2 = sheet.getCell('D4');
  kpi2.value = `🟢 ONLINE: ${onlineCount} Unit`;
  kpi2.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
  kpi2.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
  applyBoxBorder(sheet, 4, 6, 4, 'FF86EFAC');

  // Card 3: Offline (G4:I4)
  sheet.mergeCells('G4:I4');
  const kpi3 = sheet.getCell('G4');
  kpi3.value = `🔴 OFFLINE / LOS: ${offlineCount} Unit`;
  kpi3.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  kpi3.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
  applyBoxBorder(sheet, 7, 9, 4, 'FFFCA5A5');

  // Card 4: Redaman Kritis (J4:L4)
  sheet.mergeCells('J4:L4');
  const kpi4 = sheet.getCell('J4');
  kpi4.value = `⚠️ REDAMAN KRITIS: ${badRxCount} Unit`;
  kpi4.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFA16207' } };
  kpi4.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
  applyBoxBorder(sheet, 10, 12, 4, 'FFFDE047');

  // Card 5: Total HP Terhubung (M4:O4)
  sheet.mergeCells('M4:O4');
  const kpi5 = sheet.getCell('M4');
  kpi5.value = `📱 TOTAL HP AKTIF: ${totalClients} Klien`;
  kpi5.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0E7490' } };
  kpi5.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCFFAFE' } };
  applyBoxBorder(sheet, 13, 15, 4, 'FF67E8F9');

  sheet.getRow(4).height = 25;

  // ROW 5: Spacer
  sheet.getRow(5).height = 8;

  // ==========================================
  // ROW 6: Table Headers
  // ==========================================
  const headers = [
    'No',
    'Status',
    'Nama Pelanggan',
    'No. WhatsApp',
    'Serial Number (SN)',
    'SSID Wi-Fi',
    'Password Wi-Fi',
    'Redaman (RX)',
    'Kondisi RX',
    'Suhu ONT',
    'Uptime',
    'IP PPPoE',
    'User PPPoE',
    'Tipe ONT',
    'HP Terhubung'
  ];

  const headerRow = sheet.getRow(6);
  headerRow.values = headers;
  headerRow.height = 28;
  headerRow.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  for (let c = 1; c <= 15; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Royal Deep Navy
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF3B82F6' } },
      right: { style: 'thin', color: { argb: 'FF3B82F6' } }
    };
  }

  // ==========================================
  // DATA ROWS (Starting Row 7)
  // ==========================================
  devices.forEach((d, idx) => {
    const rowNum = 7 + idx;
    const row = sheet.getRow(rowNum);
    const isEven = idx % 2 === 0;
    const defaultBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC'; // Clean zebra row

    const phoneStr = d.phone ? String(d.phone).trim() : '-';
    const rxRaw = d.rx !== null && d.rx !== undefined ? parseFloat(d.rx) : null;
    const rxText = rxRaw !== null ? `${rxRaw} dBm` : '-';
    const tempVal = d.temp !== null && d.temp !== undefined ? `${d.temp} °C` : '-';
    const passVal = (d.password && d.password.trim() !== '') ? d.password : '******';

    row.values = [
      idx + 1,
      d.online ? 'ONLINE' : 'OFFLINE',
      d.name || '-',
      phoneStr,
      d.sn || '-',
      d.ssid || '-',
      passVal,
      rxText,
      d.rxStatus || 'Normal',
      tempVal,
      d.uptime || '-',
      d.pppoeIp || '-',
      d.pppoeUser || '-',
      d.model || 'Huawei ONT',
      parseInt(d.activeClients, 10) || 0
    ];

    row.height = 23;
    row.font = { name: 'Segoe UI', size: 9.5 };

    // Apply baseline cell borders & fills
    for (let c = 1; c <= 15; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: defaultBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      cell.alignment = { vertical: 'middle' };
    }

    // 1. No (Center, gray)
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(1).font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF64748B' } };

    // 2. Status Badge (ONLINE / OFFLINE)
    const statusCell = row.getCell(2);
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (d.online) {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      statusCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF15803D' } };
    } else {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      statusCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB91C1C' } };
    }

    // 3. Nama Pelanggan (Bold dark text, Left aligned)
    const nameCell = row.getCell(3);
    nameCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // 4. No WhatsApp (Text format '@', Cyan/Blue bold)
    const phoneCell = row.getCell(4);
    phoneCell.numFmt = '@';
    phoneCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (phoneStr !== '-') {
      phoneCell.font = { name: 'Consolas', size: 9.5, bold: true, color: { argb: 'FF0369A1' } };
    } else {
      phoneCell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF94A3B8' } };
    }

    // 5. Serial Number (Monospace, Center)
    const snCell = row.getCell(5);
    snCell.numFmt = '@';
    snCell.alignment = { horizontal: 'center', vertical: 'middle' };
    snCell.font = { name: 'Consolas', size: 9, color: { argb: 'FF334155' } };

    // 6. SSID Wi-Fi (Bold text, Left)
    const ssidCell = row.getCell(6);
    ssidCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
    ssidCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // 7. Password Wi-Fi (Consolas, Emerald Green if known, Gray if masked)
    const passCell = row.getCell(7);
    passCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (passVal !== '******') {
      passCell.font = { name: 'Consolas', size: 9.5, bold: true, color: { argb: 'FF047857' } };
    } else {
      passCell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF94A3B8' } };
    }

    // 8. Redaman RX (Color coded: Red <= -27, Yellow <= -24, Green > -24)
    const rxCell = row.getCell(8);
    rxCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (rxRaw !== null) {
      if (rxRaw <= -27) {
        rxCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
      } else if (rxRaw <= -24) {
        rxCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFD97706' } };
      } else {
        rxCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF059669' } };
      }
    }

    // 9. Kondisi RX Badge (Soft Background + Bold Text)
    const rxStatusCell = row.getCell(9);
    rxStatusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (d.rxStatus === 'Bahaya') {
      rxStatusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      rxStatusCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB91C1C' } };
    } else if (d.rxStatus === 'Sedang') {
      rxStatusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      rxStatusCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB45309' } };
    } else {
      rxStatusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      rxStatusCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF15803D' } };
    }

    // 10. Suhu ONT
    row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };

    // 11. Uptime
    row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };

    // 12. IP PPPoE
    const ipCell = row.getCell(12);
    ipCell.numFmt = '@';
    ipCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ipCell.font = { name: 'Consolas', size: 9, color: { argb: 'FF334155' } };

    // 13. User PPPoE
    row.getCell(13).alignment = { horizontal: 'left', vertical: 'middle' };

    // 14. Tipe ONT
    row.getCell(14).alignment = { horizontal: 'center', vertical: 'middle' };

    // 15. HP Terhubung
    const clientsCell = row.getCell(15);
    clientsCell.alignment = { horizontal: 'center', vertical: 'middle' };
    clientsCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0284C7' } };
  });

  // Enable AutoFilter on Table Header (A6:O6)
  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6, column: 15 }
  };

  return workbook.xlsx.writeBuffer();
}

module.exports = { generateDevicesExcel };
