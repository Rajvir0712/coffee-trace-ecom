"""
Coffee Lot Lineage Tracker - Backend Processor
Performs VLOOKUP, inner joins, and recursive lineage tracing on Excel data
"""

import pandas as pd
from typing import Dict, List, Set, Optional, Any
from datetime import datetime
import json

class CoffeeLotLineageTracker:
    def __init__(self):
        self.records = []
        self.production_purchase = []
        self.acom_navision_purchase = []
        self.lot_index = {}
        self.prod_order_index = {}
        
    def load_excel_file(self, file_path: str, main_sheet: str = 'ACOM Production Consumption'):
        """Load Excel file and all relevant sheets"""
        print(f"Loading Excel file: {file_path}")
        
        # Read all sheets
        excel_file = pd.ExcelFile(file_path)
        
        # Load main sheet
        if main_sheet in excel_file.sheet_names:
            df_main = pd.read_excel(file_path, sheet_name=main_sheet)
            self.records = df_main.to_dict('records')
            print(f"Loaded {len(self.records)} records from {main_sheet}")
        
        # Load additional sheets
        sheet_mappings = {
            'ACOM Navision Purchase': 'acom_navision_purchase',
            'Production Purchase': 'production_purchase'
        }
        
        for sheet_name, attr_name in sheet_mappings.items():
            if sheet_name in excel_file.sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                setattr(self, attr_name, df.to_dict('records'))
                print(f"Loaded {len(df)} records from {sheet_name}")
        
        # Perform VLOOKUP
        self.perform_vlookup()
        
        # Preprocess data for efficient lookups
        self.preprocess_data()
        
    def perform_vlookup(self):
        """
        Perform VLOOKUP operation: Match Lot No_ from main sheet 
        with Lots column in Purchase sheet and merge data
        """
        print("\n=== Performing VLOOKUP ===")
        
        if not self.acom_navision_purchase:
            print("No purchase data available for VLOOKUP")
            return
        
        # Create lookup dictionary: Lots -> Purchase Record
        purchase_lookup = {}
        for purchase in self.acom_navision_purchase:
            lots = str(purchase.get('Lots', '')).strip()
            if lots:
                purchase_lookup[lots] = purchase
        
        print(f"Created purchase lookup with {len(purchase_lookup)} lots")
        
        # Merge purchase data into records
        match_count = 0
        for record in self.records:
            lot_no = str(record.get('Lot No_', '')).strip()
            
            if lot_no and lot_no in purchase_lookup:
                purchase_data = purchase_lookup[lot_no]
                
                # Get column keys from purchase data
                purchase_cols = list(purchase_data.keys())
                
                # Map columns (simulating Excel VLOOKUP returning columns 2-11)
                if len(purchase_cols) > 1:
                    record['VLOOKUP_Col2'] = purchase_data.get(purchase_cols[1])
                if len(purchase_cols) > 2:
                    record['VLOOKUP_Description'] = purchase_data.get(purchase_cols[2])
                if len(purchase_cols) > 3:
                    record['VLOOKUP_Quantity'] = purchase_data.get(purchase_cols[3])
                if len(purchase_cols) > 4:
                    record['VLOOKUP_Unit'] = purchase_data.get(purchase_cols[4])
                if len(purchase_cols) > 5:
                    record['VLOOKUP_Contract'] = purchase_data.get(purchase_cols[5])
                if len(purchase_cols) > 6:
                    record['VLOOKUP_Season'] = purchase_data.get(purchase_cols[6])
                if len(purchase_cols) > 7:
                    record['VLOOKUP_DeliveryDate'] = purchase_data.get(purchase_cols[7])
                if len(purchase_cols) > 8:
                    record['VLOOKUP_Origin'] = purchase_data.get(purchase_cols[8])
                if len(purchase_cols) > 9:
                    record['VLOOKUP_Certification'] = purchase_data.get(purchase_cols[9])
                if len(purchase_cols) > 10:
                    record['VLOOKUP_Counterparty'] = purchase_data.get(purchase_cols[10])
                
                match_count += 1
        
        print(f"VLOOKUP completed: {match_count} matches found out of {len(self.records)} records")
    
    def preprocess_data(self):
        """Build indexes for efficient lookups"""
        print("\n=== Building indexes ===")
        
        # Index by Lot No_
        for record in self.records:
            lot_no = str(record.get('Lot No_', '')).strip()
            if lot_no:
                if lot_no not in self.lot_index:
                    self.lot_index[lot_no] = []
                self.lot_index[lot_no].append(record)
        
        # Index by Prod_ Order No_
        for record in self.records:
            prod_order = str(record.get('Prod_ Order No_', '')).strip()
            if prod_order:
                if prod_order not in self.prod_order_index:
                    self.prod_order_index[prod_order] = []
                self.prod_order_index[prod_order].append(record)
        
        print(f"Indexed {len(self.lot_index)} unique lot numbers")
        print(f"Indexed {len(self.prod_order_index)} unique production orders")
    
    def get_lot_lineage(self, lot_no: str, max_depth: int = 10) -> Dict[str, Any]:
        """
        Recursively trace lineage for a given lot number
        Returns origin chain (where it came from) and destination chain (where it went)
        """
        print(f"\n=== Tracing lineage for Lot: {lot_no} ===")
        
        visited_lots = set()
        visited_prod_orders = set()
        
        def build_node(lot: str, depth: int, direction: str) -> Optional[Dict]:
            """Recursively build lineage tree"""
            if depth > max_depth or lot in visited_lots:
                return None
            
            visited_lots.add(lot)
            records = self.lot_index.get(lot, [])
            
            if not records:
                return None
            
            # Use first record for this lot
            record = records[0]
            
            node = {
                'lotNo': lot,
                'prodOrderNo': record.get('Prod_ Order No_', ''),
                'description': record.get('Description', ''),
                'quantity': record.get('Quantity', 0),
                'unit': record.get('Unit of Measure', ''),
                'postingDate': str(record.get('Posting Date', '')),
                'documentType': record.get('Document Type', ''),
                'origins': [],
                'destinations': [],
                'depth': depth
            }
            
            # Trace origins (where this lot came from)
            if direction in ['origin', 'both']:
                prod_order = str(record.get('Prod_ Order No_', '')).strip()
                if prod_order and prod_order not in visited_prod_orders:
                    visited_prod_orders.add(prod_order)
                    
                    # Find consumption records for this production order
                    consumption_records = self.prod_order_index.get(prod_order, [])
                    for cons_rec in consumption_records:
                        if cons_rec.get('Document Type') == 'Consumption':
                            origin_lot = str(cons_rec.get('Lot No_', '')).strip()
                            if origin_lot and origin_lot != lot:
                                origin_node = build_node(origin_lot, depth + 1, 'origin')
                                if origin_node:
                                    node['origins'].append(origin_node)
            
            # Trace destinations (where this lot went to)
            if direction in ['destination', 'both']:
                # Find production records where this lot was consumed
                for prod_order, prod_records in self.prod_order_index.items():
                    if prod_order in visited_prod_orders:
                        continue
                    
                    for prod_rec in prod_records:
                        if prod_rec.get('Document Type') == 'Consumption':
                            cons_lot = str(prod_rec.get('Lot No_', '')).strip()
                            if cons_lot == lot:
                                # Find output of this production order
                                for output_rec in prod_records:
                                    if output_rec.get('Document Type') == 'Output':
                                        dest_lot = str(output_rec.get('Lot No_', '')).strip()
                                        if dest_lot and dest_lot != lot:
                                            visited_prod_orders.add(prod_order)
                                            dest_node = build_node(dest_lot, depth + 1, 'destination')
                                            if dest_node:
                                                node['destinations'].append(dest_node)
            
            return node
        
        lineage_tree = build_node(lot_no, 0, 'both')
        
        return {
            'queriedLot': lot_no,
            'lineageTree': lineage_tree,
            'totalNodesTraced': len(visited_lots)
        }
    
    def get_lot_statistics(self, lot_no: str) -> Dict[str, Any]:
        """Calculate statistics for a given lot"""
        records = self.lot_index.get(lot_no, [])
        
        if not records:
            return {'error': f'No records found for lot {lot_no}'}
        
        total_quantity = sum(float(r.get('Quantity', 0)) for r in records)
        
        return {
            'lotNo': lot_no,
            'totalRecords': len(records),
            'totalQuantity': total_quantity,
            'documentTypes': list(set(r.get('Document Type', '') for r in records)),
            'postingDates': sorted(list(set(str(r.get('Posting Date', '')) for r in records))),
            'units': list(set(r.get('Unit of Measure', '') for r in records))
        }
    
    def perform_inner_join(self, sheet1_key: str, sheet2_key: str, 
                          join_column1: str, join_column2: str) -> List[Dict]:
        """
        Perform inner join between two sheets
        Example: Join production records with purchase records on matching lot numbers
        """
        print(f"\n=== Performing Inner Join ===")
        print(f"Joining {sheet1_key}.{join_column1} with {sheet2_key}.{join_column2}")
        
        # Get datasets
        dataset1 = self.records if sheet1_key == 'main' else getattr(self, sheet1_key, [])
        dataset2 = getattr(self, sheet2_key, [])
        
        # Create lookup from dataset2
        lookup = {}
        for record in dataset2:
            key = str(record.get(join_column2, '')).strip()
            if key:
                if key not in lookup:
                    lookup[key] = []
                lookup[key].append(record)
        
        # Perform join
        joined_results = []
        for record1 in dataset1:
            key = str(record1.get(join_column1, '')).strip()
            if key and key in lookup:
                for record2 in lookup[key]:
                    # Merge both records
                    joined_record = {**record1}
                    for k, v in record2.items():
                        joined_record[f"{sheet2_key}_{k}"] = v
                    joined_results.append(joined_record)
        
        print(f"Inner join produced {len(joined_results)} results")
        return joined_results
    
    def export_results(self, output_file: str, data: Any):
        """Export results to JSON file"""
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        print(f"\nResults exported to {output_file}")


# Example usage
if __name__ == "__main__":
    # Initialize tracker
    tracker = CoffeeLotLineageTracker()
    
    # Load Excel file
    excel_file_path = "test-data.xlsx"  # Change this to your file path
    tracker.load_excel_file(excel_file_path)
    
    # Example 1: Get lineage for a specific lot
    lot_to_trace = "LOT001"  # Change this to your lot number
    lineage_result = tracker.get_lot_lineage(lot_to_trace, max_depth=5)
    tracker.export_results("lineage_result.json", lineage_result)
    
    # Example 2: Get statistics for a lot
    stats = tracker.get_lot_statistics(lot_to_trace)
    print(f"\nStatistics for {lot_to_trace}:")
    print(json.dumps(stats, indent=2, default=str))
    
    # Example 3: Perform inner join
    joined_data = tracker.perform_inner_join(
        sheet1_key='main',
        sheet2_key='acom_navision_purchase',
        join_column1='Lot No_',
        join_column2='Lots'
    )
    tracker.export_results("joined_results.json", joined_data)
    
    # Example 4: Get all lot numbers
    all_lots = sorted(tracker.lot_index.keys())
    print(f"\nTotal unique lots: {len(all_lots)}")
    print(f"Sample lots: {all_lots[:10]}")
