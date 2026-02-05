
# Plan: Complete Rewrite of Auto-Paginated GraphQL Data Fetcher with Excel Export

## Problem Analysis

The current implementation has issues with cursor-based pagination:
1. The cursor isn't being properly passed/used between API calls
2. The pagination loop logic has edge case bugs
3. The UI doesn't provide clear progress feedback during multi-page fetching

## Solution Overview

Completely rewrite the `GraphQLDataPreview` component with a robust auto-pagination system that:
1. Fetches all pages automatically using cursor-based pagination
2. Shows clear real-time progress with page-by-page status
3. Accumulates all records and displays them in a single table
4. Exports everything as ONE Excel file with one click
5. Includes cancel and retry functionality

---

## Implementation Details

### 1. Frontend Component (`src/components/GraphQLDataPreview.tsx`)

**State Management:**
```text
- allRecords: Array<Record> - accumulated records from all pages
- isExporting: boolean - true while auto-fetch is in progress
- exportProgress: {
    currentPage: number,
    pagesCompleted: PageInfo[],  // { pageNumber, recordCount }
    totalRecords: number,
    isComplete: boolean,
    error: string | null
  }
- isCancelled: useRef<boolean> - abort flag
```

**Core Fetch Loop Logic:**
```text
async exportAllToExcel():
  1. Reset state, set isExporting = true
  2. Initialize: cursor = null, allRecords = []
  
  3. LOOP:
     a. Call Edge Function with { pageSize: 10000, cursor }
     b. Extract: items, endCursor, hasNextPage
     c. Append items to allRecords
     d. Update progress: add to pagesCompleted, update totalRecords
     e. Check abort flag - if cancelled, break
     f. If hasNextPage === false OR items.length === 0:
        - Mark complete, break loop
     g. Set cursor = endCursor, continue loop
  
  4. On complete: Generate Excel file, trigger download
  5. On error: Show error with partial data option
  6. Finally: set isExporting = false
```

**UI Components:**

A. **Export Button (always visible)**
   - Label: "Export All to Excel"
   - Icon: Download or FileSpreadsheet icon
   - Disabled while export in progress

B. **Progress Panel (during export)**
   ```text
   +--------------------------------------------------+
   | Exporting Lineage Data...                        |
   |                                                  |
   | Page 2 fetching...                               |
   | [=========>                        ]             |
   |                                                  |
   | Page 1: 10,000 records                           |
   | Page 2: fetching...                              |
   |                                                  |
   | Total: 10,000 records                            |
   |                                                  |
   | [Cancel Export]                                  |
   +--------------------------------------------------+
   ```

C. **Success State**
   ```text
   +--------------------------------------------------+
   | Export Complete!                                 |
   |                                                  |
   | 27,432 records exported to Excel                 |
   | File: lineage_nodes_2026-02-05.xlsx              |
   |                                                  |
   | [Export Again]                                   |
   +--------------------------------------------------+
   ```

D. **Error State with Options**
   ```text
   +--------------------------------------------------+
   | Export Failed                                    |
   |                                                  |
   | Error on page 3: Network timeout                 |
   |                                                  |
   | 20,000 records fetched before error              |
   |                                                  |
   | [Retry]  [Download Partial (20k)]  [Cancel]      |
   +--------------------------------------------------+
   ```

### 2. Excel Generation

```text
function downloadAsExcel(records, tableName):
  1. Flatten nested objects to strings
  2. Create worksheet from JSON array
  3. Create workbook, add worksheet
  4. Generate filename: {tableName}_export_{YYYY-MM-DD}.xlsx
  5. Trigger browser download
```

### 3. Data Table Display

- Show all accumulated records in a scrollable table
- Real-time updates as pages are fetched
- Full-width, full-height layout (using viewport calculations)

---

## Edge Function (No Changes Required)

The existing `query-fabric-graphql` Edge Function already supports:
- `pageSize` parameter
- `cursor` parameter for pagination
- Returns `end_cursor` and `has_next_page` in response

The issue is purely frontend - the cursor isn't being passed correctly.

---

## UI Flow

1. User sees "Export All to Excel" button
2. User clicks button
3. Progress panel appears with live updates
4. Each page fetched shows in the progress list
5. When complete, Excel file auto-downloads
6. Success message shown with total record count
7. User can click "Export Again" to re-run

---

## Technical Considerations

| Concern | Solution |
|---------|----------|
| Memory for large datasets | Use array accumulation, warn if >100k records |
| Browser freeze during export | Use async/await with state updates between pages |
| Cancel mid-export | useRef abort flag checked in loop |
| Partial data on error | Offer "Download Partial" button |
| Network timeouts | Show clear error with retry option |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/GraphQLDataPreview.tsx` | Complete rewrite with new UI and robust pagination loop |

---

## Summary

This plan implements a one-click "Export All to Excel" feature that:
- Loops through all paginated API calls automatically
- Uses `hasNextPage` and `endCursor` correctly for cursor-based pagination
- Shows real-time progress with page-by-page status
- Handles errors gracefully with retry/partial download options
- Downloads all data as a single Excel file when complete

The key fix is ensuring the cursor is properly extracted from each response and passed to the next API call.
