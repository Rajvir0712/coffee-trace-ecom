import * as XLSX from 'xlsx';

export async function debugExcelVLOOKUP(file: File): Promise<void> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  
  // Read ACOM Production Consumption sheet
  const productionSheet = workbook.Sheets['ACOM Production Consumption'];
  if (productionSheet) {
    const productionData = XLSX.utils.sheet_to_json(productionSheet, { raw: false, defval: '' });
    console.log('=== ACOM Production Consumption ===');
    console.log('Columns:', Object.keys(productionData[0] || {}));
    console.log('Sample rows (first 3):');
    productionData.slice(0, 3).forEach((row: any, idx) => {
      console.log(`Row ${idx + 1}:`, {
        'Prod_ Order No_': row['Prod_ Order No_'],
        'Item No_': row['Item No_'],
        'Description': row['Description']
      });
    });
    
    // Show unique Prod_ Order No_ values
    const prodOrders = new Set<string>();
    productionData.forEach((row: any) => {
      const po = String(row['Prod_ Order No_'] || '').trim();
      if (po) prodOrders.add(po);
    });
    console.log(`\nFound ${prodOrders.size} unique Prod_ Order No_ values`);
    console.log('First 10:', Array.from(prodOrders).slice(0, 10));
  }
  
  // Read ACOM Navision Purchase sheet
  const purchaseSheet = workbook.Sheets['ACOM Navision Purchase'];
  if (purchaseSheet) {
    const purchaseData = XLSX.utils.sheet_to_json(purchaseSheet, { raw: false, defval: '' });
    console.log('\n=== ACOM Navision Purchase ===');
    console.log('Columns:', Object.keys(purchaseData[0] || {}));
    console.log('Sample rows (first 3):');
    purchaseData.slice(0, 3).forEach((row: any, idx) => {
      console.log(`Row ${idx + 1}:`, {
        'Contract': row['Contract'],
        'Description': row['Description'],
        'Location Code': row['Location Code']
      });
    });
    
    // Show unique Contract values
    const contracts = new Set<string>();
    purchaseData.forEach((row: any) => {
      const contract = String(row['Contract'] || '').trim();
      if (contract) contracts.add(contract);
    });
    console.log(`\nFound ${contracts.size} unique Contract values`);
    console.log('First 10:', Array.from(contracts).slice(0, 10));
    
    // Check for matches
    console.log('\n=== VLOOKUP Match Analysis ===');
    const prodOrdersSet = new Set<string>();
    const productionData = XLSX.utils.sheet_to_json(productionSheet, { raw: false, defval: '' });
    productionData.forEach((row: any) => {
      const po = String(row['Prod_ Order No_'] || '').trim();
      if (po) prodOrdersSet.add(po);
    });
    
    const matches: string[] = [];
    const noMatches: string[] = [];
    
    prodOrdersSet.forEach(po => {
      if (contracts.has(po)) {
        matches.push(po);
      } else {
        noMatches.push(po);
      }
    });
    
    console.log(`\nMatches found: ${matches.length}`);
    console.log('Sample matches:', matches.slice(0, 5));
    console.log(`\nNo matches: ${noMatches.length}`);
    console.log('Sample no-matches:', noMatches.slice(0, 5));
  }
}
