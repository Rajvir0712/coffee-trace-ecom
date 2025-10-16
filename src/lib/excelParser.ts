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
  details: {
    item_no?: string;
    description?: string;
    certified?: string;
    unit_of_measure?: string;
    production_order?: string;
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

  async loadExcelFile(file: File, sheetName: string = 'ACOM Production Consumption '): Promise<void> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet) as LotRecord[];
    this.records = jsonData;
    
    // Debug: Log available columns from first record
    if (jsonData.length > 0) {
      console.log('Available Excel columns:', Object.keys(jsonData[0]));
      console.log('Sample record:', jsonData[0]);
    }
    
    this.preprocessData();
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

  getLotLineage(lotNo: string, maxDepth: number = 50): LineageResult {
    const visited = new Set<string>();

    const traceLotOrigin = (lot: string, depth: number = 0): LineageNode => {
      if (visited.has(lot) || depth >= maxDepth) {
        return {
          lot_no: lot,
          warning: depth >= maxDepth ? 'Max depth reached or circular reference detected' : 'Already visited',
          process_types: ['Unknown'],
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
        process_types: Object.keys(processes),
        sources: [],
        details: {}
      };

      // Add details from first record (robust header matching across records)
      if (lotData.length > 0) {
        const findByPatterns = (rec: Record<string, any>, patterns: RegExp[]) => {
          const keys = Object.keys(rec);
          for (const key of keys) {
            if (patterns.some((re) => re.test(key))) {
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
        const locMatch = findAcross(lotData, [/^location\s*code$/i, /location\s*code/i, /location/i]);
        const cpMatch = findAcross(lotData, [/counter\s*party/i, /counterparty/i, /vendor/i, /customer/i]);

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
            node.details.output_date = String(outputRecord['Date'] || '');

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
          const transferDetails = {
            transfer_quantity: transferRecord['Quantity (Inv_UoM)'] || 0,
            transfer_date: String(transferRecord['Date'] || ''),
            transferred_to: transferRecord['Lot Dest']
          };

          node.details.transfer = transferDetails;

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
          date: String(purchaseRecord['Date'] || '')
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
}
