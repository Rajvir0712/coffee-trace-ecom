
# Plan: Auto-Fetch All Pages Until Complete

## Overview
Modify the GraphQL data preview to automatically fetch all pages sequentially until the end is reached, then display and allow downloading all records as one amalgamated Excel file.

## Current Behavior
- Fetches only page 1 automatically
- User must click "Next" to fetch each additional page
- Download only exports the current page's 10,000 records

## New Behavior
- Automatically fetches page 1, then page 2, then page 3... until `hasNextPage` is false
- Shows real-time progress during fetching (e.g., "Fetching page 3... 27,500 records loaded")
- Displays all amalgamated records in the table once complete
- Download button exports ALL records to a single Excel file

## Detection Logic
The system knows it has reached the end when:
1. `hasNextPage` is `false` from the API response, OR
2. A page returns fewer than 10,000 records (indicating it's the last page)

## Implementation Details

### Frontend Changes (`src/components/GraphQLDataPreview.tsx`)

1. **Add new state for auto-fetching**
   - `allNodes`: Array to accumulate all records across pages
   - `isFetchingAll`: Boolean to track if auto-fetch is in progress
   - `fetchProgress`: Object with `currentPage` and `totalRecords` for progress display

2. **Create auto-fetch loop function**
   ```text
   fetchAllPages():
     - Start with page 1, no cursor
     - Loop:
       - Fetch page with current cursor
       - Append records to allNodes array
       - Update progress state
       - If hasNextPage is true AND records === 10000:
         - Continue with next cursor
       - Else:
         - Stop (reached the end)
   ```

3. **Update UI components**
   - Show progress bar/indicator during fetch: "Fetching page 3 of ?... 25,000 records loaded"
   - Display total record count in header when complete
   - Change download button to "Download All (X records)"

4. **Remove pagination controls**
   - No more Next/Previous buttons needed
   - All data shown in one scrollable table

### No Edge Function Changes Required
The existing Edge Function already supports cursor-based pagination - we just need to call it in a loop from the frontend.

## UI Changes

### During Fetch
```text
+--------------------------------------------------+
| Lineage Data Preview                             |
| Fetching data... Page 3 • 27,500 records loaded  |
| [=============>                    ] 60%         |
+--------------------------------------------------+
|                  Loading...                      |
+--------------------------------------------------+
```

### After Complete
```text
+--------------------------------------------------+
| Lineage Data Preview              [Download All] |
| Complete • 45,230 records from 5 pages           |
+--------------------------------------------------+
| Sale Contract | Lot No | Parent Lot | Depth |... |
|---------------|--------|------------|-------|... |
| SC001         | L001   | null       | 0     |... |
| SC001         | L002   | L001       | 1     |... |
| ...           | ...    | ...        | ...   |... |
+--------------------------------------------------+
```

## Technical Considerations

1. **Memory Management**
   - For very large datasets (500k+ records), the browser may slow down
   - Will add a warning if total records exceed 100,000

2. **Error Handling**
   - If a page fails mid-fetch, show error with retry option
   - Display how many records were successfully fetched before failure

3. **Performance**
   - Table virtualization could be added later if scrolling becomes laggy
   - For now, the table will render all rows (acceptable for up to ~50k records)

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/GraphQLDataPreview.tsx` | Add auto-fetch loop, progress UI, amalgamated download |

## Summary
This change transforms the component from manual page-by-page navigation to automatic full-dataset extraction with progress feedback and a single amalgamated Excel download.
