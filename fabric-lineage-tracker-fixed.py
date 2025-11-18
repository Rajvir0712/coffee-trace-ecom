# ========== CELL 1: Fixed Lineage Tracker Class ==========
import json
from datetime import datetime, timedelta

class LotLineageTracker:
    """Recursive lineage tracker for coffee lots with complete bidirectional tracing."""
    
    def __init__(self, df_production):
        self.df_production = df_production
        self.lot_records_cache = {}
        self.prod_order_cache = {}
        print("✓ LotLineageTracker initialized")
    
    def parse_excel_date(self, date_value):
        if date_value is None or date_value == '':
            return ''
        try:
            if isinstance(date_value, (int, float)):
                base_date = datetime(1899, 12, 30)
                parsed_date = base_date + timedelta(days=date_value)
                return parsed_date.strftime('%Y-%m-%d')
            else:
                parsed_date = datetime.fromisoformat(str(date_value).split('T')[0])
                return parsed_date.strftime('%Y-%m-%d')
        except:
            return str(date_value)
    
    def get_lot_records(self, lot_no):
        if lot_no in self.lot_records_cache:
            return self.lot_records_cache[lot_no]
        records = self.df_production.filter(self.df_production["Lot No_"] == lot_no).collect()
        result = [row.asDict() for row in records]
        self.lot_records_cache[lot_no] = result
        return result
    
    def get_prod_order_records(self, prod_order):
        if prod_order in self.prod_order_cache:
            return self.prod_order_cache[prod_order]
        records = self.df_production.filter(self.df_production["Prod_ Order No_"] == prod_order).collect()
        result = [row.asDict() for row in records]
        self.prod_order_cache[prod_order] = result
        return result
    
    def get_process_types_for_lot(self, lot):
        lot_data = self.get_lot_records(lot)
        if not lot_data:
            return ['Not Found']
        types = set()
        for record in lot_data:
            process_type = record.get('Process Type', 'Unknown')
            if process_type:
                types.add(str(process_type).strip())
        return list(types) if types else ['Unknown']
    
    def get_lot_lineage(self, lot_no, max_depth=100):
        visited = set()
        
        def trace_lot_origin(lot, depth=0):
            # Check termination conditions
            if lot in visited or depth >= max_depth:
                return {
                    'lot_no': lot,
                    'warning': 'Max depth reached' if depth >= max_depth else 'Already visited',
                    'process_types': self.get_process_types_for_lot(lot),
                    'sources': [],
                    'destinations': [],
                    'details': {}
                }
            
            visited.add(lot)
            lot_data = self.get_lot_records(lot)
            
            # Handle not found
            if not lot_data:
                return {
                    'lot_no': lot,
                    'process_types': ['Not Found'],
                    'sources': [],
                    'destinations': [],
                    'details': {}
                }
            
            # Group records by process type
            processes = {}
            for record in lot_data:
                process_type = record.get('Process Type') or 'Unknown'
                if process_type not in processes:
                    processes[process_type] = []
                processes[process_type].append(record)
            
            # Initialize node structure
            node = {
                'lot_no': lot,
                'process_types': self.get_process_types_for_lot(lot),
                'sources': [],
                'destinations': [],
                'details': {}
            }
            
            # Add basic details
            if lot_data:
                first = lot_data[0]
                node['details'] = {
                    'item_no': first.get('Item No_', ''),
                    'description': first.get('Description', ''),
                    'certified': first.get('Certified', ''),
                    'unit_of_measure': first.get('Unit of Measure', 'KG'),
                    'location_code': first.get('Location Code', ''),
                    'counterparty': first.get('Counterparty', '')
                }
            
            # ===== HANDLE OUTPUT PROCESS =====
            # This lot was produced (Output) by consuming other lots
            # Find SOURCES: What was consumed to make this lot?
            if 'Output' in processes:
                for output_record in processes['Output']:
                    prod_order = output_record.get('Prod_ Order No_')
                    if prod_order:
                        node['details']['production_order'] = prod_order
                        node['details']['output_quantity'] = output_record.get('Quantity (Inv_UoM)', 0)
                        node['details']['output_date'] = self.parse_excel_date(output_record.get('Date'))
                        
                        # Get all records in this production order
                        prod_records = self.get_prod_order_records(prod_order)
                        consumption_lots = set()
                        
                        # Find all CONSUMPTION lots in the same production order
                        for record in prod_records:
                            if record.get('Process Type') == 'Consumption' and record.get('Lot No_') != lot:
                                consumption_lots.add(record.get('Lot No_'))
                        
                        # Recursively trace each consumed lot as a SOURCE
                        for consumed_lot in consumption_lots:
                            if consumed_lot:
                                source_node = trace_lot_origin(consumed_lot, depth + 1)
                                source_node['relationship'] = 'Consumed to produce this lot'
                                node['sources'].append(source_node)
            
            # ===== HANDLE CONSUMPTION PROCESS =====
            # This lot was consumed (Consumption) to produce other lots
            # Find DESTINATIONS: What was produced by consuming this lot?
            if 'Consumption' in processes:
                for consumption_record in processes['Consumption']:
                    prod_order = consumption_record.get('Prod_ Order No_')
                    if prod_order:
                        node['details']['consumption_quantity'] = consumption_record.get('Quantity (Inv_UoM)', 0)
                        node['details']['consumption_date'] = self.parse_excel_date(consumption_record.get('Date'))
                        
                        # Get all records in this production order
                        prod_records = self.get_prod_order_records(prod_order)
                        output_lots = set()
                        
                        # Find all OUTPUT lots in the same production order
                        for record in prod_records:
                            if record.get('Process Type') == 'Output' and record.get('Lot No_') != lot:
                                output_lots.add(record.get('Lot No_'))
                        
                        # Recursively trace each output lot as a DESTINATION
                        for output_lot in output_lots:
                            if output_lot:
                                dest_node = trace_lot_origin(output_lot, depth + 1)
                                dest_node['relationship'] = 'Produced by consuming this lot'
                                node['destinations'].append(dest_node)
            
            # ===== HANDLE TRANSFER PROCESS =====
            # This lot was transferred
            if 'Transfer' in processes:
                for transfer_record in processes['Transfer']:
                    dest_lot = transfer_record.get('Lot Dest')
                    node['details']['transfer'] = {
                        'transfer_quantity': transfer_record.get('Quantity (Inv_UoM)', 0),
                        'transfer_date': self.parse_excel_date(transfer_record.get('Date')),
                        'transferred_to': dest_lot
                    }
                    
                    # Find DESTINATION: Where this lot was transferred TO
                    if dest_lot and dest_lot != lot:
                        dest_node = trace_lot_origin(dest_lot, depth + 1)
                        dest_node['relationship'] = 'Transferred to'
                        node['destinations'].append(dest_node)
                    
                    # Find SOURCE: Lots that were transferred to create this lot
                    source_transfers = self.df_production.filter(
                        (self.df_production["Process Type"] == "Transfer") & 
                        (self.df_production["Lot Dest"] == lot) &
                        (self.df_production["Lot No_"] != lot)
                    ).collect()
                    
                    for src_transfer in source_transfers:
                        source_lot = src_transfer['Lot No_']
                        if source_lot and source_lot != lot:
                            source_node = trace_lot_origin(source_lot, depth + 1)
                            source_node['relationship'] = 'Transferred from'
                            node['sources'].append(source_node)
            
            # ===== HANDLE PURCHASE PROCESS =====
            # This lot was purchased (origin point)
            if 'Purchase' in processes:
                purchase_record = processes['Purchase'][0]
                node['details']['purchase'] = {
                    'quantity': purchase_record.get('Quantity (Inv_UoM)', 0),
                    'date': self.parse_excel_date(purchase_record.get('Date'))
                }
                node['is_origin'] = True  # Mark as origin point
            
            return node
        
        # Start the recursive trace
        lineage_tree = trace_lot_origin(lot_no)
        
        return {
            'query_lot': lot_no,
            'total_lots_traced': len(visited),
            'lineage_tree': lineage_tree
        }
    
    def get_lineage_as_json(self, lot_no, max_depth=100, pretty=True):
        """Get lineage as JSON string"""
        lineage = self.get_lot_lineage(lot_no, max_depth)
        if pretty:
            return json.dumps(lineage, indent=2, ensure_ascii=False)
        return json.dumps(lineage, ensure_ascii=False)
    
    def trace_multiple_lots(self, lot_numbers, max_depth=100):
        """Trace lineage for multiple lots with progress tracking"""
        results = {}
        total = len(lot_numbers)
        for i, lot_no in enumerate(lot_numbers, 1):
            if i % 10 == 0 or i == total:
                print(f"[{i}/{total}] Tracing lot: {lot_no}")
            results[lot_no] = self.get_lot_lineage(lot_no, max_depth)
        return results
    
    def clear_cache(self):
        """Clear all caches"""
        self.lot_records_cache.clear()
        self.prod_order_cache.clear()
        print("✓ Cache cleared")


# ========== CELL 2: Initialize Tracker ==========
tracker = LotLineageTracker(df_production)


# ========== CELL 3: Get Consumption Lots from Step 5 ==========
consumption_lots_df = step5.select("consumptionLot").distinct()
consumption_lots = [row['consumptionLot'] for row in consumption_lots_df.collect()]

print(f"✓ Found {len(consumption_lots)} unique consumption lots")
print(f"Sample lots: {consumption_lots[:5]}")


# ========== CELL 4: Test with Single Lot ==========
test_lot = consumption_lots[0]
print(f"\n=== Testing with lot: {test_lot} ===")

test_lineage = tracker.get_lot_lineage(test_lot, max_depth=150)
print(f"✓ Successfully traced {test_lineage['total_lots_traced']} lots")
print(f"✓ Sources found: {len(test_lineage['lineage_tree'].get('sources', []))}")
print(f"✓ Destinations found: {len(test_lineage['lineage_tree'].get('destinations', []))}")
print(f"\nSample output (first 2000 chars):")
print(json.dumps(test_lineage, indent=2)[:2000])


# ========== CELL 5: Trace All Consumption Lots ==========
print(f"\n=== Tracing ALL {len(consumption_lots)} consumption lots ===")
print("⏳ This may take several minutes...\n")

import time
start_time = time.time()

all_lineages = tracker.trace_multiple_lots(consumption_lots, max_depth=150)

elapsed = time.time() - start_time
print(f"\n✓ Completed in {elapsed:.2f} seconds ({elapsed/60:.1f} minutes)")
print(f"  - Consumption lots traced: {len(all_lineages)}")
print(f"  - Total related lots found: {sum(l['total_lots_traced'] for l in all_lineages.values())}")


# ========== CELL 6: Export Complete JSON ==========
total_lots = sum(l['total_lots_traced'] for l in all_lineages.values())
avg_lots = total_lots / len(all_lineages) if all_lineages else 0

final_output = {
    'sale_contract': 'SALE_CONTRACT_ID',  # Replace with actual contract
    'trace_timestamp': datetime.now().isoformat(),
    'summary': {
        'consumption_lots_found': len(consumption_lots),
        'total_related_lots_traced': total_lots,
        'average_depth': round(avg_lots, 1),
        'max_depth_used': 150
    },
    'consumption_lots': consumption_lots,
    'lineage_traces': all_lineages
}

json_output = json.dumps(final_output, indent=2, ensure_ascii=False)

print("\n" + "="*80)
print("🎉 COMPLETE - BIDIRECTIONAL LINEAGE TRACING")
print("="*80)
print(f"\n✓ Total consumption lots: {len(all_lineages)}")
print(f"✓ Total related lots: {total_lots}")
print(f"✓ JSON size: {len(json_output.encode('utf-8')) / 1024:.2f} KB")
print("\n" + "="*80)
print("📥 COPY JSON BELOW")
print("="*80 + "\n")

print(json_output)

print("\n" + "="*80)
print("📥 END OF JSON")
print("="*80)
