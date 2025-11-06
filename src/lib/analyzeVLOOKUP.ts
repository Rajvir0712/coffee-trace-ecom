import * as XLSX from 'xlsx';

export async function analyzeVLOOKUPStructure(file: File): Promise<void> {
  console.log('\n🔍 ========== ANALYZING VLOOKUP STRUCTURE ==========');
  
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  
  // Analyze ACOM Navision Purchase sheet (the lookup table)
  console.log('\n📊 ACOM NAVISION PURCHASE SHEET (Lookup Table):');
  const purchaseSheet = workbook.Sheets['ACOM Navision Purchase'];
  if (purchaseSheet) {
    const purchaseData = XLSX.utils.sheet_to_json(purchaseSheet, { raw: false, defval: '', header: 1 });
    
    // Get column headers (row 1)
    const headers = purchaseData[0] as any[];
    console.log('Column mapping (for VLOOKUP):');
    headers.forEach((header, index) => {
      console.log(`  Column ${String.fromCharCode(65 + index)} (index ${index + 1}): "${header}"`);
    });
    
    // Show first few data rows
    console.log('\nFirst 3 data rows:');
    for (let i = 1; i <= 3 && i < purchaseData.length; i++) {
      const row = purchaseData[i] as any[];
      console.log(`Row ${i + 1}:`, {
        'Column A (Contract)': row[0],
        'Column B (index 2)': row[1],
        'Column C (index 3)': row[2],
        'Column D (index 4)': row[3],
        'Column E (index 5)': row[4]
      });
    }
    
    // Get unique Contract values (Column A)
    const contracts = new Set<string>();
    for (let i = 1; i < purchaseData.length; i++) {
      const row = purchaseData[i] as any[];
      const contract = String(row[0] || '').trim();
      if (contract) contracts.add(contract);
    }
    console.log(`\nTotal unique Contract values (Column A): ${contracts.size}`);
    console.log('Sample Contract values:', Array.from(contracts).slice(0, 10));
  }
  
  // Analyze ACOM Production Consumption sheet (the main data)
  console.log('\n📊 ACOM PRODUCTION CONSUMPTION SHEET (Main Data):');
  const productionSheet = workbook.Sheets['ACOM Production Consumption'];
  if (productionSheet) {
    const productionData = XLSX.utils.sheet_to_json(productionSheet, { raw: false, defval: '', header: 1 });
    
    // Get column headers
    const headers = productionData[0] as any[];
    console.log('Column headers:');
    headers.forEach((header, index) => {
      const col = String.fromCharCode(65 + index);
      console.log(`  Column ${col}: "${header}"`);
    });
    
    // Show first few data rows with focus on Column A (Prod_ Order No_)
    console.log('\nFirst 3 data rows (showing key columns):');
    for (let i = 1; i <= 3 && i < productionData.length; i++) {
      const row = productionData[i] as any[];
      console.log(`Row ${i + 1}:`, {
        'Column A (Prod_ Order No_)': row[0],
        'Column K (should be VLOOKUP result)': row[10],
        'Column L': row[11]
      });
    }
    
    // Get unique Prod_ Order No_ values (Column A)
    const prodOrders = new Set<string>();
    for (let i = 1; i < productionData.length; i++) {
      const row = productionData[i] as any[];
      const prodOrder = String(row[0] || '').trim();
      if (prodOrder) prodOrders.add(prodOrder);
    }
    console.log(`\nTotal unique Prod_ Order No_ values (Column A): ${prodOrders.size}`);
    console.log('Sample Prod_ Order No_ values:', Array.from(prodOrders).slice(0, 10));
    
    // Check for matches
    if (purchaseSheet) {
      const purchaseData = XLSX.utils.sheet_to_json(purchaseSheet, { raw: false, defval: '', header: 1 });
      const contracts = new Set<string>();
      for (let i = 1; i < purchaseData.length; i++) {
        const row = purchaseData[i] as any[];
        const contract = String(row[0] || '').trim();
        if (contract) contracts.add(contract);
      }
      
      console.log('\n🔗 VLOOKUP MATCH ANALYSIS:');
      const matches: string[] = [];
      const noMatches: string[] = [];
      
      prodOrders.forEach(po => {
        if (contracts.has(po)) {
          matches.push(po);
        } else {
          noMatches.push(po);
        }
      });
      
      console.log(`✅ Matches found: ${matches.length}`);
      if (matches.length > 0) {
        console.log('Sample matches:', matches.slice(0, 10));
      }
      
      console.log(`❌ No matches: ${noMatches.length}`);
      if (noMatches.length > 0) {
        console.log('Sample no-matches:', noMatches.slice(0, 10));
      }
      
      // Show what data would be returned for matching rows
      if (matches.length > 0) {
        console.log('\n📋 SAMPLE VLOOKUP RESULTS for first match:');
        const firstMatch = matches[0];
        for (let i = 1; i < purchaseData.length; i++) {
          const row = purchaseData[i] as any[];
          if (String(row[0] || '').trim() === firstMatch) {
            const headers = purchaseData[0] as any[];
            console.log(`Looking up "${firstMatch}" returns:`);
            for (let col = 1; col < Math.min(headers.length, 11); col++) {
              console.log(`  Column ${String.fromCharCode(65 + col)} (index ${col + 1}) "${headers[col]}": "${row[col]}"`);
            }
            break;
          }
        }
      }
    }
  }
  
  console.log('\n========== END VLOOKUP ANALYSIS ==========\n');
}
