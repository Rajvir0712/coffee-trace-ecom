import * as XLSX from 'xlsx';

export interface CocoaRecord {
  Company: string;
  PC: string;
  'Lot Number': string;
  'Lot Code': string;
  Client: string;
  Invoice: string;
  'Invoice Date': string;
  Destination: string;
  'Shipment date': string;
  'Sale Contract #': string;
  'Customer ref': string;
  'Purchase Contract': string;
  'EAL Reference': string;
  Counterparty: string;
  Quantity: string;
  Unit: string;
  'Lot #': string;
  'Container Number': string;
  Certified: string;
  'BL #': string;
}

export class CocoaTracker {
  private records: CocoaRecord[] = [];

  async loadExcelFile(file: File): Promise<void> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    
    // Get first sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Parse to JSON
    const jsonData = XLSX.utils.sheet_to_json<CocoaRecord>(worksheet);
    this.records = jsonData;
  }

  getAllSalesContracts(): string[] {
    const contracts = new Set<string>();
    this.records.forEach(record => {
      if (record['Sale Contract #']) {
        contracts.add(record['Sale Contract #']);
      }
    });
    return Array.from(contracts).sort();
  }

  getRecordsBySalesContract(saleContract: string): CocoaRecord[] {
    return this.records.filter(record => 
      record['Sale Contract #'] === saleContract
    );
  }
}
