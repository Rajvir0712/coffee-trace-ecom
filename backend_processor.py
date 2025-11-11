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
        # Additional sheets for 5-step join
        self.eacl_navision = []
        self.acom_sale = []
        self.acom_nav_transform = []
        self.acom_nav_bridge = []
        self.acom_production_results = []
        # Indexes
        self.lot_index = {}
        self.prod_order_index = {}
        self.purchase_lot_map = {}  # Maps sale contract # to consumption lots
        
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
        
        # Load all additional sheets (7 total)
        sheet_mappings = {
            'ACOM Navision Purchase': 'acom_navision_purchase',
            'Production Purchase': 'production_purchase',
            'EACL Navision': 'eacl_navision',
            'ACOM Navision Sale': 'acom_sale',
            'ACOM Nav Transform': 'acom_nav_transform',
            'ACOM Nav Bridge': 'acom_nav_bridge',
            'ACOM Production Results ': 'acom_production_results'  # Note the space
        }
        
        for sheet_name, attr_name in sheet_mappings.items():
            if sheet_name in excel_file.sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                setattr(self, attr_name, df.to_dict('records'))
                print(f"Loaded {len(df)} records from {sheet_name}")
            else:
                print(f"WARNING: Sheet '{sheet_name}' not found")
        
        # Perform VLOOKUP
        self.perform_vlookup()
        
        # Build purchase lot mapping (5-step join)
        self.build_purchase_lot_mapping()
        
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
    
    def build_purchase_lot_mapping(self):
        """
        Build mapping from Sale Contract # to consumption lots using 5-step join logic
        Matches the TypeScript implementation in excelParser.ts
        """
        print("\n=== Building Purchase Lot Mapping (5-Step Join) ===")
        
        self.purchase_lot_map = {}
        
        def norm(v):
            """Normalize values for comparison"""
            return str(v if v is not None else '').strip().upper()
        
        # Step 1: EACL Navision [Lot Number] -> ACOM Navision Sale [Sale Contract]
        step1 = []
        for eacl in self.eacl_navision:
            lot_number = eacl.get('Lot Number')
            if lot_number is None or str(lot_number).strip() == '':
                continue
            lot_norm = norm(lot_number)
            
            for acom in self.acom_sale:
                if norm(acom.get('Sale Contract', '')) == lot_norm:
                    step1.append({
                        'lotNumber': str(lot_number),
                        'saleContract': acom.get('Sale Contract'),
                        'saleLot': acom.get('Lot #'),
                        'saleContractNumber': eacl.get('Sale Contract #')  # Keep original sale contract #
                    })
        
        print(f"Step 1: EACL Navision [Lot Number] -> ACOM Sale: {len(step1)} matches")
        
        # Step 2: ACOM Navision Sale [Lot #] -> ACOM Nav Transform [Sale Lot]
        step2 = []
        for item in step1:
            for transform in self.acom_nav_transform:
                if norm(transform.get('Sale Lot', '')) == norm(item['saleLot']):
                    step2.append({
                        'lotNumber': item['lotNumber'],
                        'saleLot': item['saleLot'],
                        'productionLot': transform.get('Production Lot'),
                        'saleContractNumber': item['saleContractNumber']
                    })
        
        print(f"Step 2: ACOM Sale -> ACOM Transform: {len(step2)} matches")
        
        # Step 3: ACOM Nav Transform [Production Lot] -> ACOM Nav Bridge [Lot No_(O)]
        step3 = []
        for item in step2:
            for bridge in self.acom_nav_bridge:
                if norm(bridge.get('Lot No_(O)', '')) == norm(item['productionLot']):
                    step3.append({
                        'lotNumber': item['lotNumber'],
                        'productionLot': item['productionLot'],
                        'bridgeDestLot': bridge.get('Lot No_(D)'),
                        'saleContractNumber': item['saleContractNumber']
                    })
        
        print(f"Step 3: ACOM Transform -> ACOM Bridge: {len(step3)} matches")
        
        # Step 4: ACOM Nav Bridge [Lot No_(D)] -> ACOM Production Results [Lot No_]
        step4 = []
        for item in step3:
            for prod in self.acom_production_results:
                if norm(prod.get('Lot No_', '')) == norm(item['bridgeDestLot']):
                    prod_order = prod.get('Prod_ Order No_')
                    step4.append({
                        'lotNumber': item['lotNumber'],
                        'bridgeDestLot': item['bridgeDestLot'],
                        'prodOrder': prod_order,
                        'saleContractNumber': item['saleContractNumber']
                    })
        
        print(f"Step 4: ACOM Bridge -> ACOM Production Results: {len(step4)} matches")
        
        # Step 5: ACOM Production Results [Prod_ Order No_] -> ACOM Production Consumption [Prod_ Order No_] (Consumption only)
        step5 = []
        for item in step4:
            # Find consumption records with matching production order
            consumption_lots = [
                r for r in self.records 
                if r.get('Prod_ Order No_') == item['prodOrder'] 
                and r.get('Process Type') == 'Consumption'
            ]
            
            for lot in consumption_lots:
                consumption_lot_no = lot.get('Lot No_')
                step5.append({
                    'lotNumber': item['lotNumber'],
                    'prodOrder': item['prodOrder'],
                    'consumptionLot': consumption_lot_no,
                    'saleContractNumber': item['saleContractNumber']
                })
                
                # Map Sale Contract # to consumption lots
                sale_contract = str(item['saleContractNumber'])
                if sale_contract not in self.purchase_lot_map:
                    self.purchase_lot_map[sale_contract] = []
                if consumption_lot_no not in self.purchase_lot_map[sale_contract]:
                    self.purchase_lot_map[sale_contract].append(consumption_lot_no)
        
        print(f"Step 5: ACOM Production Results -> ACOM Consumption: {len(step5)} matches")
        print(f"Purchase lot mapping built: {len(self.purchase_lot_map)} sale contracts")
        
        # Return all steps for debugging
        return {
            'step1': step1,
            'step2': step2,
            'step3': step3,
            'step4': step4,
            'step5': step5
        }
    
    def get_purchase_lot_lineage(self, sale_contract: str) -> List[Dict[str, Any]]:
        """
        Get lineage for all consumption lots linked to a purchase sale contract
        Returns list of lineage results, one for each consumption lot
        """
        print(f"\n=== Getting Purchase Lot Lineage for Sale Contract: {sale_contract} ===")
        
        consumption_lots = self.purchase_lot_map.get(sale_contract, [])
        
        if not consumption_lots:
            print(f"No consumption lots found for sale contract {sale_contract}")
            return []
        
        print(f"Found {len(consumption_lots)} consumption lots for this sale contract")
        
        results = []
        for lot in consumption_lots:
            lineage = self.get_lot_lineage(lot)
            results.append(lineage)
        
        return results
    
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
    
    print("\n" + "="*60)
    print("USAGE EXAMPLES")
    print("="*60)
    
    # Example 1: Get lineage for a specific production lot
    print("\n--- Example 1: Production Lot Lineage ---")
    lot_to_trace = "LOT001"  # Change this to your lot number
    lineage_result = tracker.get_lot_lineage(lot_to_trace, max_depth=5)
    tracker.export_results("lineage_result.json", lineage_result)
    print(f"Exported lineage for {lot_to_trace} to lineage_result.json")
    
    # Example 2: Get statistics for a lot
    print("\n--- Example 2: Lot Statistics ---")
    stats = tracker.get_lot_statistics(lot_to_trace)
    print(f"Statistics for {lot_to_trace}:")
    print(json.dumps(stats, indent=2, default=str))
    
    # Example 3: Get purchase lot lineage (5-step join)
    print("\n--- Example 3: Purchase Lot Lineage (Sale Contract #) ---")
    sale_contract = "SC12345"  # Change this to your sale contract #
    purchase_lineages = tracker.get_purchase_lot_lineage(sale_contract)
    tracker.export_results("purchase_lineage_results.json", purchase_lineages)
    print(f"Exported {len(purchase_lineages)} consumption lot lineages to purchase_lineage_results.json")
    
    # Example 4: Perform inner join
    print("\n--- Example 4: Inner Join ---")
    joined_data = tracker.perform_inner_join(
        sheet1_key='main',
        sheet2_key='acom_navision_purchase',
        join_column1='Lot No_',
        join_column2='Lots'
    )
    tracker.export_results("joined_results.json", joined_data)
    
    # Example 5: Get all lot numbers and sale contracts
    print("\n--- Example 5: Summary ---")
    all_lots = sorted(tracker.lot_index.keys())
    print(f"Total unique production lots: {len(all_lots)}")
    print(f"Sample production lots: {all_lots[:10]}")
    print(f"Total sale contracts: {len(tracker.purchase_lot_map)}")
    print(f"Sample sale contracts: {list(tracker.purchase_lot_map.keys())[:10]}")
