# Fabric Notebook - Coffee Lot Lineage Tracker
# Complete implementation with VLOOKUP, Inner Joins, and Recursive Lineage
# Run this in Microsoft Fabric Notebook to test processing capabilities

import json
import time
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, collect_list, struct, lit, count, sum as spark_sum, max as spark_max
from datetime import datetime

# Initialize Spark session
spark = SparkSession.builder.appName("CoffeeLotLineage").getOrCreate()

print("=" * 80)
print("Coffee Lot Lineage Tracker - Fabric Lakehouse Implementation")
print("=" * 80)

# ============================================================================
# STEP 1: Load Data from Lakehouse Tables
# ============================================================================
print("\n[STEP 1] Loading data from Lakehouse tables...")
start_time = time.time()

# Load all tables (adjust table names to match your Lakehouse)
df_production = spark.table("production_consumption")
df_purchase = spark.table("navision_purchase")
df_sale = spark.table("navision_sale")
df_eacl = spark.table("eacl_navision")
df_transform = spark.table("nav_transform")
df_bridge = spark.table("nav_bridge")
df_results = spark.table("production_results")

load_time = time.time() - start_time
print(f"✓ Loaded all tables in {load_time:.2f} seconds")
print(f"  - Production/Consumption records: {df_production.count():,}")
print(f"  - Purchase records: {df_purchase.count():,}")
print(f"  - Sale records: {df_sale.count():,}")
print(f"  - EACL records: {df_eacl.count():,}")

# ============================================================================
# STEP 2: Perform VLOOKUP (LEFT JOIN Purchase Data into Production)
# ============================================================================
print("\n[STEP 2] Performing VLOOKUP (Purchase -> Production)...")
start_time = time.time()

# This replicates: performPurchaseVLOOKUP() from excelParser.ts
df_enriched = df_production.alias("prod").join(
    df_purchase.alias("purch"),
    col("prod.lot_no") == col("purch.lot_no"),
    "left"
).select(
    col("prod.*"),
    col("purch.supplier").alias("vlookup_supplier"),
    col("purch.origin").alias("vlookup_origin"),
    col("purch.purchase_date").alias("vlookup_purchase_date"),
    col("purch.price").alias("vlookup_price")
)

vlookup_time = time.time() - start_time
enriched_count = df_enriched.count()
matched_count = df_enriched.filter(col("vlookup_supplier").isNotNull()).count()

print(f"✓ VLOOKUP completed in {vlookup_time:.2f} seconds")
print(f"  - Total records: {enriched_count:,}")
print(f"  - Matched with purchase data: {matched_count:,} ({matched_count/enriched_count*100:.1f}%)")

# Cache enriched data for performance
df_enriched.cache()

# ============================================================================
# STEP 3: Build Purchase Lot Mapping (5-Step Inner Join)
# ============================================================================
print("\n[STEP 3] Building Purchase Lot Mapping (5-step inner join)...")
start_time = time.time()

# This replicates: buildPurchaseLotMapping() from excelParser.ts
# Join sequence:
# EACL Navision -> Nav Transform -> Nav Bridge -> Production Results -> Production Consumption

df_step1 = df_eacl.join(df_transform, "document_no", "inner")
step1_count = df_step1.count()
print(f"  Step 1: EACL -> Transform = {step1_count:,} records")

df_step2 = df_step1.join(df_bridge, "transform_key", "inner")
step2_count = df_step2.count()
print(f"  Step 2: Transform -> Bridge = {step2_count:,} records")

df_step3 = df_step2.join(df_results, "bridge_key", "inner")
step3_count = df_step3.count()
print(f"  Step 3: Bridge -> Results = {step3_count:,} records")

df_purchase_mapping = df_step3.join(
    df_enriched.select("prod_order_no", "lot_no", "quantity", "posting_date", "entry_type"),
    "prod_order_no",
    "inner"
).select(
    col("sale_contract"),
    col("lot_no").alias("production_lot"),
    col("prod_order_no"),
    col("quantity"),
    col("posting_date"),
    col("entry_type"),
    col("document_no"),
    col("transform_key"),
    col("bridge_key")
)

step4_count = df_purchase_mapping.count()
print(f"  Step 4: Results -> Production = {step4_count:,} records")

join_time = time.time() - start_time
print(f"✓ 5-step join completed in {join_time:.2f} seconds")

# Cache purchase mapping
df_purchase_mapping.cache()

# Get unique sale contracts
sale_contracts = df_purchase_mapping.select("sale_contract").distinct().rdd.flatMap(lambda x: x).collect()
print(f"  - Total unique sale contracts: {len(sale_contracts):,}")

# ============================================================================
# STEP 4: Recursive Lineage Tracing Function
# ============================================================================
print("\n[STEP 4] Setting up recursive lineage tracing...")

def trace_lot_lineage(lot_no, max_depth=10):
    """
    Recursively trace lot lineage using Spark SQL
    Replicates: getLotLineage() from excelParser.ts
    """
    
    # Register temp view for enriched data
    df_enriched.createOrReplaceTempView("production_enriched")
    
    # Recursive CTE query
    recursive_query = f"""
    WITH RECURSIVE lineage AS (
        -- Base case: Start with the queried lot
        SELECT 
            lot_no,
            lot_code,
            prod_order_no,
            item_no,
            description,
            quantity,
            unit_of_measure,
            entry_type,
            posting_date,
            document_type,
            location_code,
            vlookup_supplier as supplier,
            vlookup_origin as origin,
            vlookup_purchase_date as purchase_date,
            0 as depth,
            lot_no as path,
            'current' as relationship_type
        FROM production_enriched
        WHERE lot_no = '{lot_no}'
        
        UNION ALL
        
        -- Recursive case 1: Find origins (consumed inputs in same production order)
        SELECT 
            pe.lot_no,
            pe.lot_code,
            pe.prod_order_no,
            pe.item_no,
            pe.description,
            pe.quantity,
            pe.unit_of_measure,
            pe.entry_type,
            pe.posting_date,
            pe.document_type,
            pe.location_code,
            pe.vlookup_supplier,
            pe.vlookup_origin,
            pe.vlookup_purchase_date,
            l.depth + 1,
            CONCAT(l.path, ' -> ', pe.lot_no),
            'origin'
        FROM lineage l
        INNER JOIN production_enriched pe 
            ON l.prod_order_no = pe.prod_order_no 
            AND pe.entry_type = 'Consumption'
            AND pe.lot_no != l.lot_no
        WHERE l.depth < {max_depth}
        
        UNION ALL
        
        -- Recursive case 2: Find destinations (where this lot was consumed)
        SELECT 
            pe2.lot_no,
            pe2.lot_code,
            pe2.prod_order_no,
            pe2.item_no,
            pe2.description,
            pe2.quantity,
            pe2.unit_of_measure,
            pe2.entry_type,
            pe2.posting_date,
            pe2.document_type,
            pe2.location_code,
            pe2.vlookup_supplier,
            pe2.vlookup_origin,
            pe2.vlookup_purchase_date,
            l.depth + 1,
            CONCAT(l.path, ' -> ', pe2.lot_no),
            'destination'
        FROM lineage l
        INNER JOIN production_enriched pe1 
            ON l.lot_no = pe1.lot_no 
            AND pe1.entry_type = 'Consumption'
        INNER JOIN production_enriched pe2 
            ON pe1.prod_order_no = pe2.prod_order_no 
            AND pe2.entry_type = 'Output'
            AND pe2.lot_no != l.lot_no
        WHERE l.depth < {max_depth}
    )
    SELECT * FROM lineage
    """
    
    # Execute recursive query
    df_lineage = spark.sql(recursive_query)
    
    # Separate by relationship type
    df_current = df_lineage.filter(col("relationship_type") == "current")
    df_origins = df_lineage.filter(col("relationship_type") == "origin")
    df_destinations = df_lineage.filter(col("relationship_type") == "destination")
    
    # Build JSON structure
    result = {
        "queriedLot": lot_no,
        "lineageTree": {
            "lotNo": lot_no,
            "origins": [],
            "destinations": [],
            "details": []
        },
        "statistics": {}
    }
    
    # Collect origins
    origins_data = df_origins.collect()
    result["lineageTree"]["origins"] = [
        {
            "lotNo": row.lot_no,
            "lotCode": row.lot_code,
            "itemNo": row.item_no,
            "description": row.description,
            "quantity": float(row.quantity) if row.quantity else 0,
            "unitOfMeasure": row.unit_of_measure,
            "entryType": row.entry_type,
            "postingDate": str(row.posting_date) if row.posting_date else None,
            "documentType": row.document_type,
            "locationCode": row.location_code,
            "supplier": row.supplier,
            "supplierOrigin": row.origin,
            "purchaseDate": str(row.purchase_date) if row.purchase_date else None,
            "depth": row.depth,
            "path": row.path
        }
        for row in origins_data
    ]
    
    # Collect destinations
    destinations_data = df_destinations.collect()
    result["lineageTree"]["destinations"] = [
        {
            "lotNo": row.lot_no,
            "lotCode": row.lot_code,
            "itemNo": row.item_no,
            "description": row.description,
            "quantity": float(row.quantity) if row.quantity else 0,
            "unitOfMeasure": row.unit_of_measure,
            "entryType": row.entry_type,
            "postingDate": str(row.posting_date) if row.posting_date else None,
            "documentType": row.document_type,
            "depth": row.depth,
            "path": row.path
        }
        for row in destinations_data
    ]
    
    # Collect details (current lot records)
    details_data = df_current.collect()
    result["lineageTree"]["details"] = [
        {
            "lotNo": row.lot_no,
            "prodOrderNo": row.prod_order_no,
            "itemNo": row.item_no,
            "description": row.description,
            "quantity": float(row.quantity) if row.quantity else 0,
            "entryType": row.entry_type,
            "postingDate": str(row.posting_date) if row.posting_date else None,
            "supplier": row.supplier,
            "origin": row.origin
        }
        for row in details_data
    ]
    
    # Calculate statistics
    total_records = df_lineage.count()
    total_consumed = df_lineage.filter(col("entry_type") == "Consumption").agg(
        spark_sum("quantity").alias("sum")
    ).collect()[0]["sum"] or 0
    
    total_produced = df_lineage.filter(col("entry_type") == "Output").agg(
        spark_sum("quantity").alias("sum")
    ).collect()[0]["sum"] or 0
    
    unique_lots = df_lineage.select("lot_no").distinct().count()
    max_depth_val = df_lineage.agg(spark_max("depth").alias("max")).collect()[0]["max"] or 0
    
    result["statistics"] = {
        "totalRecords": total_records,
        "totalConsumed": float(total_consumed),
        "totalProduced": float(total_produced),
        "uniqueLots": unique_lots,
        "maxDepth": max_depth_val,
        "originCount": len(origins_data),
        "destinationCount": len(destinations_data)
    }
    
    return result

# ============================================================================
# STEP 5: Test Lineage Tracing with Sample Lot
# ============================================================================
print("\n[STEP 5] Testing lineage tracing...")

# Get a sample lot number to test
sample_lot = df_enriched.select("lot_no").filter(col("lot_no").isNotNull()).first()["lot_no"]
print(f"  Testing with sample lot: {sample_lot}")

start_time = time.time()
lineage_result = trace_lot_lineage(sample_lot, max_depth=10)
lineage_time = time.time() - start_time

print(f"✓ Lineage tracing completed in {lineage_time:.2f} seconds")
print(f"  - Total records in lineage: {lineage_result['statistics']['totalRecords']}")
print(f"  - Unique lots traced: {lineage_result['statistics']['uniqueLots']}")
print(f"  - Origin lots found: {lineage_result['statistics']['originCount']}")
print(f"  - Destination lots found: {lineage_result['statistics']['destinationCount']}")
print(f"  - Maximum depth: {lineage_result['statistics']['maxDepth']}")
print(f"  - Total consumed: {lineage_result['statistics']['totalConsumed']:.2f}")
print(f"  - Total produced: {lineage_result['statistics']['totalProduced']:.2f}")

# ============================================================================
# STEP 6: Test Purchase Lot Lineage (if sale contracts exist)
# ============================================================================
if len(sale_contracts) > 0:
    print("\n[STEP 6] Testing purchase lot lineage...")
    
    sample_contract = sale_contracts[0]
    print(f"  Testing with sale contract: {sample_contract}")
    
    start_time = time.time()
    
    # Get production lots for this sale contract
    production_lots = df_purchase_mapping.filter(
        col("sale_contract") == sample_contract
    ).select("production_lot").distinct().rdd.flatMap(lambda x: x).collect()
    
    purchase_result = {
        "saleContract": sample_contract,
        "productionLots": [],
        "lineages": []
    }
    
    # Get details for each production lot
    for prod_lot in production_lots[:5]:  # Limit to first 5 for testing
        lot_details = df_purchase_mapping.filter(
            (col("sale_contract") == sample_contract) & 
            (col("production_lot") == prod_lot)
        ).first()
        
        purchase_result["productionLots"].append({
            "lotNo": prod_lot,
            "prodOrderNo": lot_details.prod_order_no,
            "quantity": float(lot_details.quantity) if lot_details.quantity else 0,
            "postingDate": str(lot_details.posting_date) if lot_details.posting_date else None
        })
        
        # Trace lineage for this production lot
        lot_lineage = trace_lot_lineage(prod_lot, max_depth=5)
        purchase_result["lineages"].append(lot_lineage)
    
    purchase_time = time.time() - start_time
    
    print(f"✓ Purchase lot lineage completed in {purchase_time:.2f} seconds")
    print(f"  - Production lots found: {len(production_lots)}")
    print(f"  - Lineages traced: {len(purchase_result['lineages'])}")

# ============================================================================
# STEP 7: Performance Summary
# ============================================================================
print("\n" + "=" * 80)
print("PERFORMANCE SUMMARY")
print("=" * 80)
print(f"Data Loading:           {load_time:.2f}s")
print(f"VLOOKUP (LEFT JOIN):    {vlookup_time:.2f}s")
print(f"5-Step Inner Join:      {join_time:.2f}s")
print(f"Lineage Tracing (1 lot): {lineage_time:.2f}s")
if len(sale_contracts) > 0:
    print(f"Purchase Lot Lineage:   {purchase_time:.2f}s")
print("=" * 80)

# ============================================================================
# STEP 8: Export Results to JSON
# ============================================================================
print("\n[STEP 8] Exporting results to JSON...")

final_output = {
    "metadata": {
        "timestamp": datetime.now().isoformat(),
        "totalProductionRecords": enriched_count,
        "totalSaleContracts": len(sale_contracts),
        "processingTime": {
            "dataLoading": f"{load_time:.2f}s",
            "vlookup": f"{vlookup_time:.2f}s",
            "innerJoin": f"{join_time:.2f}s",
            "lineageTracing": f"{lineage_time:.2f}s"
        }
    },
    "sampleLineage": lineage_result
}

if len(sale_contracts) > 0:
    final_output["samplePurchaseLotLineage"] = purchase_result

# Save to JSON file
output_path = "/lakehouse/default/Files/lineage_output.json"
with open(output_path, 'w') as f:
    json.dump(final_output, f, indent=2)

print(f"✓ Results exported to: {output_path}")

# Also print sample JSON to console
print("\n" + "=" * 80)
print("SAMPLE LINEAGE JSON OUTPUT")
print("=" * 80)
print(json.dumps(lineage_result, indent=2)[:2000] + "...")  # First 2000 chars

print("\n✓ Processing complete! Check the full JSON output in the exported file.")
