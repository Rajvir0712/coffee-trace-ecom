import * as XLSX from 'xlsx';

export interface LotRecord {
  'Lot No_': string;
  'Process Type': string;
  'Item No_': string;
  'Description': string;
  'Certified': string;
  'Unit of Measure': string;
  'Quantity (Inv_UoM)': number;
  'Date': string;
  'Prod_ Order No_': string;
  'Lot Dest': string;
  'Location Code': string;
  'Counterparty': string;
  [key: string]: any;
}

export interface LineageNode {
  lot_no: string;
  process_types?: string[];
  sources: LineageNode[];
  destinations?: LineageNode[];
  details: {
    item_no?: string;
    description?: string;
    certified?: string;
    unit_of_measure?: string;
    production_order?: string;
    production_lot?: string;
    output_quantity?: number;
    output_date?: string;
    location_code?: string;
    counterparty?: string;
    consumed_by?: Array<{
      produced_lot: string;
      produced_item: string;
      production_order: string;
    }>;
    transfer?: {
      transfer_quantity: number;
      transfer_date: string;
      transferred_to?: string;
    };
    purchase?: {
      quantity: number;
      date: string;
    };
  };
  relationship?: string;
  is_origin?: boolean;
  warning?: string;
}

export interface LineageResult {
  query_lot: string;
  total_lots_traced: number;
  lineage_tree: LineageNode;
}

export interface LotStatistics {
  lot_no: string;
  total_records: number;
  process_types: Record<string, number>;
  total_quantity: number;
  items: string[];
  production_orders: string[];
  date_range: {
    earliest: string | null;
    latest: string | null;
  };
}

export class CoffeeLotLineageTracker {
  private records: LotRecord[] = [];
  private lotRecords: Map<string, LotRecord[]> = new Map();
  private prodOrderRecords: Map<string, LotRecord[]> = new Map();
  private transferDestinations: Map<string, string[]> = new Map();
  
  // Multi-sheet data for purchase lot tracing
  private eaclNavision: any[] = [];
  private acomSale: any[] = [];
  private acomNavTransform: any[] = [];
  private acomNavBridge: any[] = [];
  private acomNavProduction: any[] = [];
  private acomNavisionPurchase: any[] = []; // Purchase data for VLOOKUP
  private purchaseLotMap: Map<string, string[]> = new Map(); // Maps purchase lot to production lots

  async loadExcelFile(file: File, sheetName: string = 'ACOM Production Consumption '): Promise<void> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet) as LotRecord[];
    this.records = jsonData;
    
    // Load all sheets if they exist
    this.loadAllSheets(workbook);
    
    // Debug: Log available columns from first record
    if (jsonData.length > 0) {
      console.log('Available Excel columns:', Object.keys(jsonData[0]));
      console.log('Sample record:', jsonData[0]);
      
      // Log all unique Process Type values to understand what's in the data
      const processTypes = new Set<string>();
      jsonData.forEach(record => {
        const pt = record['Process Type'];
        processTypes.add(`"${pt}" (type: ${typeof pt})`);
      });
      console.log('All unique Process Type values found:', Array.from(processTypes));
      
      // Count records with empty/null process types
      const emptyProcessTypes = jsonData.filter(r => !r['Process Type'] || String(r['Process Type']).trim() === '');
      console.log(`Records with empty Process Type: ${emptyProcessTypes.length} out of ${jsonData.length}`);
      if (emptyProcessTypes.length > 0) {
        console.log('Sample empty Process Type records:', emptyProcessTypes.slice(0, 3));
      }
    }
    
    this.preprocessData();
  }

  private loadAllSheets(workbook: XLSX.WorkBook): void {
    const loadSheet = (sheetName: string): any[] => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        console.warn(`Sheet "${sheetName}" not found`);
        return [];
      }
      return XLSX.utils.sheet_to_json(sheet);
    };

    this.eaclNavision = loadSheet('EACL Navision');
    this.acomSale = loadSheet('ACOM Navision Sale');
    this.acomNavTransform = loadSheet('ACOM Nav Transform');
    this.acomNavBridge = loadSheet('ACOM Nav Bridge');
    this.acomNavProduction = loadSheet('ACOM Production Results ');
    this.acomNavisionPurchase = loadSheet('ACOM Navision Purchase');
    
    console.log('Loaded sheets:', {
      eaclNavision: this.eaclNavision.length,
      acomSale: this.acomSale.length,
      acomNavTransform: this.acomNavTransform.length,
      acomNavBridge: this.acomNavBridge.length,
      acomNavProduction: this.acomNavProduction.length,
      acomNavisionPurchase: this.acomNavisionPurchase.length
    });
    
    // Debug: Log column names from each sheet
    if (this.eaclNavision.length > 0) {
      console.log('EACL Navision columns:', Object.keys(this.eaclNavision[0]));
      console.log('EACL Navision sample:', this.eaclNavision[0]);
    }
    if (this.acomSale.length > 0) {
      console.log('ACOM Sale columns:', Object.keys(this.acomSale[0]));
      console.log('ACOM Sale sample:', this.acomSale[0]);
    }
    if (this.acomNavTransform.length > 0) {
      console.log('ACOM Transform columns:', Object.keys(this.acomNavTransform[0]));
      console.log('ACOM Transform sample:', this.acomNavTransform[0]);
    }
    if (this.acomNavBridge.length > 0) {
      console.log('ACOM Bridge columns:', Object.keys(this.acomNavBridge[0]));
      console.log('ACOM Bridge sample:', this.acomNavBridge[0]);
    }
    if (this.acomNavProduction.length > 0) {
      console.log('ACOM Production columns:', Object.keys(this.acomNavProduction[0]));
      console.log('ACOM Production sample:', this.acomNavProduction[0]);
    }
    if (this.acomNavisionPurchase.length > 0) {
      console.log('ACOM Navision Purchase columns:', Object.keys(this.acomNavisionPurchase[0]));
      console.log('ACOM Navision Purchase sample (first 3):', this.acomNavisionPurchase.slice(0, 3));
      
      // Log all unique Contract values to debug VLOOKUP matching
      const contractValues = new Set<string>();
      this.acomNavisionPurchase.forEach(p => {
        const contract = String(p['Contract'] || '').trim();
        if (contract) contractValues.add(contract);
      });
      console.log(`ACOM Navision Purchase: Found ${contractValues.size} unique Contract values`);
      console.log('Sample Contract values:', Array.from(contractValues).slice(0, 10));
    }
    
    // Perform VLOOKUP to merge purchase data into production/consumption records
    this.performPurchaseVLOOKUP();
    
    this.buildPurchaseLotMapping();
  }

  private performPurchaseVLOOKUP(): void {
    // VLOOKUP formula in Excel: =VLOOKUP($A2,'ACOM Navision Purchase'!$A$2:$K$775,2,FALSE)
    // Lookup: Column A (Lot No_) -> Column A in Purchase (Lots)
    // Return: Columns 2-11 from Purchase sheet
    // K2: col 2, L2: col 3 (Description), M2: col 4 (Quantity), N2: col 5 (Unit of Measure)
    // O2: col 6 (Contract), P2: col 7 (Season), Q2: col 8 (Date of delivery)
    // R2: col 9 (Location Code), S2: col 10 (Counterparty), T2: col 11 (Certified)
    
    if (this.acomNavisionPurchase.length === 0) {
      console.log('No ACOM Navision Purchase data available for VLOOKUP');
      return;
    }
    
    // Get column headers from the purchase sheet to understand the structure
    const purchaseKeys = this.acomNavisionPurchase.length > 0 ? Object.keys(this.acomNavisionPurchase[0]) : [];
    console.log('Purchase sheet columns:', purchaseKeys);
    
    // Create a lookup map: Lots (Column A) -> Purchase Record
    const purchaseLookup = new Map<string, any>();
    this.acomNavisionPurchase.forEach(purchase => {
      // Use "Lots" column from Purchase sheet
      const lots = String(purchase['Lots'] || '').trim();
      if (lots) {
        purchaseLookup.set(lots, purchase);
      }
    });
    
    console.log(`VLOOKUP: Created purchase lookup with ${purchaseLookup.size} lots`);
    
    // Debug: Log some Lot No_ values to compare
    const lotNumbers = new Set<string>();
    this.records.forEach(r => {
      const lotNo = String(r['Lot No_'] || '').trim();
      if (lotNo) lotNumbers.add(lotNo);
    });
    console.log(`Production/Consumption: Found ${lotNumbers.size} unique Lot No_ values`);
    console.log('Sample Lot No_ values:', Array.from(lotNumbers).slice(0, 10));
    
    // Merge purchase data into production/consumption records
    let matchCount = 0;
    let noMatchCount = 0;
    
    this.records.forEach(record => {
      // Perform VLOOKUP: Lookup Lot No_ in Purchase sheet's Lots column
      const lotNo = String(record['Lot No_'] || '').trim();
      
      if (lotNo) {
        if (purchaseLookup.has(lotNo)) {
          const purchaseData = purchaseLookup.get(lotNo);
          
          // Map the exact columns as per Excel VLOOKUP (indices 2-11)
          // These correspond to columns B-K in the Purchase sheet
          const purchaseColumns = Object.keys(purchaseData);
          
          // Column 2 (index 1 in array)
          record['VLOOKUP_Col2'] = purchaseData[purchaseColumns[1]];
          
          // Column 3 - Description
          record['VLOOKUP_Description'] = purchaseData[purchaseColumns[2]] || purchaseData['Description'];
          
          // Column 4 - Quantity
          record['VLOOKUP_Quantity'] = purchaseData[purchaseColumns[3]] || purchaseData['Quantity'];
          
          // Column 5 - Unit of Measure
          record['VLOOKUP_Unit_of_Measure'] = purchaseData[purchaseColumns[4]] || purchaseData['Unit of Measure'];
          
          // Column 6 - Contract
          record['VLOOKUP_Contract'] = purchaseData[purchaseColumns[5]] || purchaseData['Contract'];
          
          // Column 7 - Season
          record['VLOOKUP_Season'] = purchaseData[purchaseColumns[6]] || purchaseData['Season'];
          
          // Column 8 - Date of delivery
          record['VLOOKUP_Date_of_delivery'] = purchaseData[purchaseColumns[7]] || purchaseData['Date of delivery'];
          
          // Column 9 - Location Code
          record['Location Code'] = purchaseData[purchaseColumns[8]] || purchaseData['Location Code'];
          
          // Column 10 - Counterparty
          record['Counterparty'] = purchaseData[purchaseColumns[9]] || purchaseData['Counterparty'];
          
          // Column 11 - Certified
          record['Certified'] = purchaseData[purchaseColumns[10]] || purchaseData['Certified'];
          
          matchCount++;
        } else {
          noMatchCount++;
        }
      }
    });
    
    console.log(`VLOOKUP Results: ${matchCount} matches, ${noMatchCount} no matches`);
    console.log(`Match rate: ${((matchCount / (matchCount + noMatchCount)) * 100).toFixed(1)}%`);
  }

  private buildPurchaseLotMapping(): void {
    this.purchaseLotMap.clear();
    
    const norm = (v: any) => String(v ?? '').trim().toUpperCase();
    
    // Build mapping from Sale Contract # to production lots
    // We use Sale Contract # as the key for user input
    const saleContractToLots = new Map<string, string[]>();
    
    // Step 1: EACL Navision [Lot Number] -> ACOM Navision Sale ["Sale Contract"]
    const step1: Array<{lotNumber: string, saleContract: string, saleLot: string}> = [];
    this.eaclNavision.forEach(eacl => {
      const lotNumber = eacl['Lot Number'];
      if (lotNumber == null || String(lotNumber).trim() === '') return;
      const lotNorm = norm(lotNumber);
      this.acomSale.forEach(acom => {
        if (norm(acom['Sale Contract']) === lotNorm) {
          step1.push({
            lotNumber: String(lotNumber),
            saleContract: acom['Sale Contract'],
            saleLot: acom['Lot #']
          });
        }
      });
    });
    console.log(`Step 1: EACL Navision [Lot Number] -> ACOM Sale: ${step1.length} matches`);

    // Step 2: ACOM Navision Sale ["Lot #"] -> ACOM Nav Transform ["Sale Lot"]
    const step2: Array<{lotNumber: string, saleLot: string, productionLot: string}> = [];
    step1.forEach(item => {
      this.acomNavTransform.forEach(transform => {
        if (norm(transform['Sale Lot']) === norm(item.saleLot)) {
          step2.push({
            lotNumber: item.lotNumber,
            saleLot: item.saleLot,
            productionLot: transform['Production Lot']
          });
        }
      });
    });
    console.log(`Step 2: ACOM Sale -> ACOM Transform: ${step2.length} matches`);

    // Step 3: ACOM Nav Transform ["Production Lot"] -> ACOM Nav Bridge ["Lot No_(O)"]
    const step3: Array<{lotNumber: string, productionLot: string, bridgeDestLot: string}> = [];
    step2.forEach(item => {
      this.acomNavBridge.forEach(bridge => {
        if (norm(bridge['Lot No_(O)']) === norm(item.productionLot)) {
          step3.push({
            lotNumber: item.lotNumber,
            productionLot: item.productionLot,
            bridgeDestLot: bridge['Lot No_(D)']
          });
        }
      });
    });
    console.log(`Step 3: ACOM Transform -> ACOM Bridge: ${step3.length} matches`);

    // Step 4: ACOM Nav Bridge ["Lot No_(D)"] -> ACOM Production Results ["Lot No_"]
    const step4: Array<{lotNumber: string, bridgeDestLot: string, prodOrder: string}> = [];
    step3.forEach(item => {
      this.acomNavProduction.forEach(prod => {
        if (norm(prod['Lot No_']) === norm(item.bridgeDestLot)) {
          const prodOrder = prod['Prod_ Order No_'];
          step4.push({
            lotNumber: item.lotNumber,
            bridgeDestLot: item.bridgeDestLot,
            prodOrder: prodOrder
          });
        }
      });
    });
    console.log(`Step 4: ACOM Bridge -> ACOM Production Results: ${step4.length} matches`);

    // Step 5: ACOM Production Results ["Prod_ Order No_"] -> ACOM Production Consumption ["Prod_ Order No_"] (Consumption only)
    const step5: Array<{lotNumber: string, prodOrder: string, consumptionLot: string}> = [];
    step4.forEach(item => {
      const consumptionLots = this.records.filter(r => r['Prod_ Order No_'] === item.prodOrder && r['Process Type'] === 'Consumption');
      
      consumptionLots.forEach(lot => {
        const consumptionLotNo = lot['Lot No_'];
        step5.push({
          lotNumber: item.lotNumber,
          prodOrder: item.prodOrder,
          consumptionLot: consumptionLotNo
        });
        
        // Map Sale Contract # to consumption lots
        // Find the Sale Contract # that corresponds to this Lot Number
        this.eaclNavision.forEach(eacl => {
          if (norm(eacl['Lot Number']) === norm(item.lotNumber)) {
            const saleContract = String(eacl['Sale Contract #']);
            if (!this.purchaseLotMap.has(saleContract)) {
              this.purchaseLotMap.set(saleContract, []);
            }
            if (!this.purchaseLotMap.get(saleContract)!.includes(consumptionLotNo)) {
              this.purchaseLotMap.get(saleContract)!.push(consumptionLotNo);
            }
          }
        });
      });
    });
    console.log(`Step 5: ACOM Production Results -> ACOM Consumption: ${step5.length} matches`);
    
    console.log('Purchase lot mapping built:', this.purchaseLotMap.size, 'sale contracts');
  }

  private parseExcelDate(dateValue: any): string {
    if (dateValue == null || dateValue === '') {
      return '';
    }

    let parsedDate: Date | null = null;
    
    // If it's a number (Excel serial date), convert it
    if (typeof dateValue === 'number') {
      // Excel serial date starts from 1900-01-01
      parsedDate = new Date((dateValue - 25569) * 86400 * 1000);
    } else {
      // Try to parse as string
      parsedDate = new Date(dateValue);
    }

    // Check if valid date and return in ISO format
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split('T')[0];
    }
    
    return String(dateValue);
  }

  private preprocessData(): void {
    // Index by lot number
    this.lotRecords.clear();
    this.prodOrderRecords.clear();
    this.transferDestinations.clear();

    this.records.forEach(record => {
      // Index by lot number
      const lotNo = record['Lot No_'];
      if (lotNo) {
        if (!this.lotRecords.has(lotNo)) {
          this.lotRecords.set(lotNo, []);
        }
        this.lotRecords.get(lotNo)!.push(record);
      }

      // Index by production order
      const prodOrder = record['Prod_ Order No_'];
      if (prodOrder) {
        if (!this.prodOrderRecords.has(prodOrder)) {
          this.prodOrderRecords.set(prodOrder, []);
        }
        this.prodOrderRecords.get(prodOrder)!.push(record);
      }

      // Index transfer destinations
      if (record['Process Type'] === 'Transfer' && record['Lot Dest']) {
        if (!this.transferDestinations.has(lotNo)) {
          this.transferDestinations.set(lotNo, []);
        }
        this.transferDestinations.get(lotNo)!.push(record['Lot Dest']);
      }
    });
  }

  private getProcessTypesForLot(lot: string): string[] {
    const lotData = this.lotRecords.get(lot) || [];
    if (lotData.length === 0) return ['Not Found'];

    const types = new Set<string>();

    for (const record of lotData) {
      const t = String(record['Process Type'] || 'Unknown').trim();
      if (t) {
        types.add(t);
      }
    }

    return types.size > 0 ? Array.from(types) : ['Unknown'];
  }

  getLotLineage(lotNo: string, maxDepth: number = 50): LineageResult {
    const visited = new Set<string>();

    const traceLotOrigin = (lot: string, depth: number = 0): LineageNode => {
      if (visited.has(lot) || depth >= maxDepth) {
        return {
          lot_no: lot,
          warning: depth >= maxDepth ? 'Max depth reached or circular reference detected' : 'Already visited',
          process_types: this.getProcessTypesForLot(lot),
          sources: [],
          details: {}
        };
      }

      visited.add(lot);

      const lotData = this.lotRecords.get(lot) || [];

      if (lotData.length === 0) {
        return {
          lot_no: lot,
          process_types: ['Not Found'],
          sources: [],
          details: {}
        };
      }

      // Organize by process type
      const processes: Record<string, LotRecord[]> = {};
      lotData.forEach(record => {
        const processType = record['Process Type'] || 'Unknown';
        if (!processes[processType]) {
          processes[processType] = [];
        }
        processes[processType].push(record);
      });

      const node: LineageNode = {
        lot_no: lot,
        process_types: this.getProcessTypesForLot(lot),
        sources: [],
        destinations: [],
        details: {}
      };

      // Add details from first record (robust header matching across records)
      if (lotData.length > 0) {
        const findByPatterns = (rec: Record<string, any>, patterns: RegExp[]) => {
          const keys = Object.keys(rec);
          for (const key of keys) {
            const normKey = key.replace(/[_\s]+/g, ' ').toLowerCase();
            if (patterns.some((re) => re.test(normKey))) {
              return { key, value: rec[key] };
            }
          }
          return { key: undefined as string | undefined, value: undefined };
        };

        const findAcross = (records: LotRecord[], patterns: RegExp[]) => {
          for (const r of records) {
            const { key, value } = findByPatterns(r, patterns);
            if (value != null && String(value).trim() !== '') {
              return { key, value };
            }
          }
          return { key: undefined as string | undefined, value: '' };
        };

        const first = lotData[0];
        
        // Check for Location Code in both original and Purchase_ prefixed fields
        let locMatch = findAcross(lotData, [/^location\s*code$/i, /location\s*code/i, /location/i]);
        if (!locMatch.value || String(locMatch.value).trim() === '') {
          // Try Purchase_ prefixed fields
          locMatch = findAcross(lotData, [/^purchase_location\s*code$/i, /purchase_location/i]);
        }
        
        // Check for Counterparty in both original and Purchase_ prefixed fields
        let cpMatch = findAcross(lotData, [/counter\s*party/i, /counterparty/i, /vendor/i, /customer/i]);
        if (!cpMatch.value || String(cpMatch.value).trim() === '') {
          // Try Purchase_ prefixed fields
          cpMatch = findAcross(lotData, [/^purchase_counter\s*party/i, /purchase_counterparty/i]);
        }

        node.details = {
          item_no: first['Item No_'] || '',
          description: first['Description'] || '',
          certified: first['Certified'] || '',
          unit_of_measure: first['Unit of Measure'] || 'KG',
          location_code: String(locMatch.value ?? ''),
          counterparty: String(cpMatch.value ?? '')
        };
        
        // Debug: Log what we're extracting and matched keys
        console.log(`Details for lot ${lot}:`, {
          matched_location_key: locMatch.key,
          matched_counterparty_key: cpMatch.key,
          location_code: node.details.location_code,
          counterparty: node.details.counterparty,
          sample_keys: Object.keys(first)
        });
      }

      // Process Output records
      if (processes['Output']) {
        processes['Output'].forEach(outputRecord => {
          const prodOrder = outputRecord['Prod_ Order No_'];
          if (prodOrder) {
            node.details.production_order = prodOrder;
            node.details.output_quantity = outputRecord['Quantity (Inv_UoM)'] || 0;
            node.details.output_date = this.parseExcelDate(outputRecord['Date']);

            const prodRecords = this.prodOrderRecords.get(prodOrder) || [];
            const consumptionLots = new Set<string>();

            prodRecords.forEach(record => {
              if (record['Process Type'] === 'Consumption' && record['Lot No_'] !== lot) {
                consumptionLots.add(record['Lot No_']);
              }
            });

            consumptionLots.forEach(consumedLot => {
              const sourceNode = traceLotOrigin(consumedLot, depth + 1);
              sourceNode.relationship = 'Consumed for Output';
              node.sources.push(sourceNode);
            });
          }
        });
      }

      // Process Consumption records
      if (processes['Consumption']) {
        processes['Consumption'].forEach(consumptionRecord => {
          const prodOrder = consumptionRecord['Prod_ Order No_'];
          if (prodOrder) {
            const prodRecords = this.prodOrderRecords.get(prodOrder) || [];

            prodRecords.forEach(record => {
              if (record['Process Type'] === 'Output') {
                const outputInfo = {
                  produced_lot: record['Lot No_'] || '',
                  produced_item: record['Description'] || '',
                  production_order: prodOrder
                };
                if (!node.details.consumed_by) {
                  node.details.consumed_by = [];
                }
                node.details.consumed_by.push(outputInfo);
              }
            });
          }
        });
      }

      // Process Transfer records
      if (processes['Transfer']) {
        processes['Transfer'].forEach(transferRecord => {
          const destLot = transferRecord['Lot Dest'];
          const transferDetails = {
            transfer_quantity: transferRecord['Quantity (Inv_UoM)'] || 0,
            transfer_date: this.parseExcelDate(transferRecord['Date']),
            transferred_to: destLot
          };

          node.details.transfer = transferDetails;

          // Add destination lot as a forward connection
          if (destLot && destLot !== lot) {
            const destNode = traceLotOrigin(destLot, depth + 1);
            destNode.relationship = 'Transferred to';
            node.destinations!.push(destNode);
          }

          // Find source of transfer
          this.transferDestinations.forEach((destinations, sourceLot) => {
            if (destinations.includes(lot) && sourceLot !== lot) {
              const sourceNode = traceLotOrigin(sourceLot, depth + 1);
              sourceNode.relationship = 'Transferred from';
              node.sources.push(sourceNode);
            }
          });
        });
      }

      // Process Purchase records
      if (processes['Purchase']) {
        const purchaseRecord = processes['Purchase'][0];
        node.details.purchase = {
          quantity: purchaseRecord['Quantity (Inv_UoM)'] || 0,
          date: this.parseExcelDate(purchaseRecord['Date'])
        };
        node.is_origin = true;
      }

      return node;
    };

    const lineage = traceLotOrigin(lotNo);

    return {
      query_lot: lotNo,
      total_lots_traced: visited.size,
      lineage_tree: lineage
    };
  }

  getLotStatistics(lotNo: string): LotStatistics | { error: string } {
    const lotData = this.lotRecords.get(lotNo);

    if (!lotData) {
      return { error: `Lot ${lotNo} not found` };
    }

    const stats: LotStatistics = {
      lot_no: lotNo,
      total_records: lotData.length,
      process_types: {},
      total_quantity: 0,
      items: [],
      production_orders: [],
      date_range: {
        earliest: null,
        latest: null
      }
    };

    const itemsSet = new Set<string>();
    const prodOrdersSet = new Set<string>();
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    lotData.forEach(record => {
      const processType = record['Process Type'] || 'Unknown';
      stats.process_types[processType] = (stats.process_types[processType] || 0) + 1;

      const quantity = record['Quantity (Inv_UoM)'];
      if (quantity != null) {
        stats.total_quantity += quantity;
      }

      const item = record['Item No_'];
      if (item) {
        itemsSet.add(item);
      }

      const prodOrder = record['Prod_ Order No_'];
      if (prodOrder) {
        prodOrdersSet.add(prodOrder);
      }

      // Parse date - Excel dates might be serial numbers or strings
      const dateValue = record['Date'];
      if (dateValue != null && dateValue !== '') {
        let parsedDate: Date | null = null;
        
        // If it's a number (Excel serial date), convert it
        if (typeof dateValue === 'number') {
          // Excel serial date starts from 1900-01-01
          parsedDate = new Date((dateValue - 25569) * 86400 * 1000);
        } else {
          // Try to parse as string
          parsedDate = new Date(dateValue);
        }

        // Check if valid date
        if (parsedDate && !isNaN(parsedDate.getTime())) {
          if (!earliestDate || parsedDate < earliestDate) {
            earliestDate = parsedDate;
          }
          if (!latestDate || parsedDate > latestDate) {
            latestDate = parsedDate;
          }
        }
      }
    });

    stats.items = Array.from(itemsSet);
    stats.production_orders = Array.from(prodOrdersSet);
    
    // Store dates in ISO format for consistent display
    if (earliestDate) {
      stats.date_range.earliest = earliestDate.toISOString().split('T')[0];
    }
    if (latestDate) {
      stats.date_range.latest = latestDate.toISOString().split('T')[0];
    }

    return stats;
  }

  getAllLotNumbers(): string[] {
    return Array.from(this.lotRecords.keys()).sort();
  }

  getAllPurchaseLots(): string[] {
    // Return Sale Contract # values from EACL Navision
    const saleContracts = new Set<string>();
    this.eaclNavision.forEach(eacl => {
      const sc = eacl['Sale Contract #'];
      if (sc != null) saleContracts.add(String(sc));
    });
    return Array.from(saleContracts).sort();
  }

  private resolveSaleContractToLotNumbers(saleContract: string): string[] {
    const norm = (v: any) => String(v ?? '').trim().toUpperCase();
    const scNorm = norm(saleContract);
    const lotNumbers: string[] = [];
    this.eaclNavision.forEach(eacl => {
      if (norm(eacl['Sale Contract #']) === scNorm) {
        const lotNumber = eacl['Lot Number'];
        if (lotNumber && !lotNumbers.includes(String(lotNumber))) {
          lotNumbers.push(String(lotNumber));
        }
      }
    });
    return lotNumbers;
  }

  getProductionLotsFromPurchase(saleContract: string): string[] {
    return this.purchaseLotMap.get(saleContract) || [];
  }

  getJoinStepsForPurchaseLot(saleContract: string): Array<{step: string, matches: any[]}> {
    const steps: Array<{step: string, matches: any[]}> = [];
    const norm = (v: any) => String(v ?? '').trim().toUpperCase();
    
    // Step 0: Resolve Sale Contract # -> Lot Number in EACL Navision
    const step0Matches: any[] = [];
    this.eaclNavision.forEach(eacl => {
      if (norm(eacl['Sale Contract #']) === norm(saleContract)) {
        step0Matches.push({
          saleContract: eacl['Sale Contract #'],
          lotNumber: eacl['Lot Number']
        });
      }
    });
    steps.push({
      step: '0. EACL Navision [Sale Contract #] → EACL Navision [Lot Number]',
      matches: step0Matches
    });
    
    // Get resolved Lot Numbers
    const lotNumbers = this.resolveSaleContractToLotNumbers(saleContract);
    
    // Step 1: EACL Navision [Lot Number] -> ACOM Sale
    const step1Matches: any[] = [];
    lotNumbers.forEach(lotNumber => {
      this.acomSale.forEach(acom => {
        if (norm(acom['Sale Contract']) === norm(lotNumber)) {
          step1Matches.push({
            lotNumber: lotNumber,
            saleContract: acom['Sale Contract'],
            saleLot: acom['Lot #']
          });
        }
      });
    });
    steps.push({
      step: '1. EACL Navision [Lot Number] → ACOM Sale [Sale Contract]',
      matches: step1Matches
    });

    // Step 2: ACOM Sale -> ACOM Transform
    const step2Matches: any[] = [];
    step1Matches.forEach(item => {
      this.acomNavTransform.forEach(transform => {
        if (norm(transform['Sale Lot']) === norm(item.saleLot)) {
          step2Matches.push({
            saleLot: item.saleLot,
            productionLot: transform['Production Lot']
          });
        }
      });
    });
    steps.push({
      step: '2. ACOM Sale [Lot #] → ACOM Transform [Sale Lot]',
      matches: step2Matches
    });

    // Step 3: ACOM Transform -> ACOM Bridge
    const step3Matches: any[] = [];
    step2Matches.forEach(item => {
      this.acomNavBridge.forEach(bridge => {
        if (norm(bridge['Lot No_(O)']) === norm(item.productionLot)) {
          step3Matches.push({
            productionLot: item.productionLot,
            bridgeDestLot: bridge['Lot No_(D)']
          });
        }
      });
    });
    steps.push({
      step: '3. ACOM Transform [Production Lot] → ACOM Bridge [Lot No_(O)]',
      matches: step3Matches
    });

    // Step 4: ACOM Bridge -> ACOM Production Results
    const step4Matches: any[] = [];
    step3Matches.forEach(item => {
      this.acomNavProduction.forEach(prod => {
        if (norm(prod['Lot No_']) === norm(item.bridgeDestLot)) {
          step4Matches.push({
            bridgeDestLot: item.bridgeDestLot,
            prodOrder: prod['Prod_ Order No_']
          });
        }
      });
    });
    steps.push({
      step: '4. ACOM Bridge [Lot No_(D)] → ACOM Production Results [Lot No_]',
      matches: step4Matches
    });

    // Step 5: ACOM Production Results -> ACOM Consumption
    const step5Matches: any[] = [];
    step4Matches.forEach(item => {
      const consumptionLots = this.records.filter(r => r['Prod_ Order No_'] === item.prodOrder && r['Process Type'] === 'Consumption');
      consumptionLots.forEach(lot => {
        step5Matches.push({
          prodOrder: item.prodOrder,
          consumptionLot: lot['Lot No_'],
          itemNo: lot['Item No_']
        });
      });
    });
    steps.push({
      step: '5. ACOM Production Results [Prod_ Order No_] → ACOM Consumption [Prod_ Order No_]',
      matches: step5Matches
    });

    return steps;
  }

  getPurchaseLotLineage(saleContract: string, maxDepth: number = 50): LineageResult[] {
    const productionLots = this.getProductionLotsFromPurchase(saleContract);
    
    if (productionLots.length === 0) {
      return [{
        query_lot: saleContract,
        total_lots_traced: 0,
        lineage_tree: {
          lot_no: saleContract,
          process_types: ['Sale Contract (Not Found in Production)'],
          sources: [],
          details: {},
          is_origin: true
        }
      }];
    }

    // Get lineage for each production/consumption lot separately
    const results: LineageResult[] = [];
    
    productionLots.forEach(prodLot => {
      const lineageResult = this.getLotLineage(prodLot, maxDepth);
      // Add purchase lot info to the details
      lineageResult.lineage_tree.details.production_lot = prodLot;
      results.push(lineageResult);
    });

    return results;
  }
}
