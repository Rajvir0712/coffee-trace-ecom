
# Plan: Integrate Fabric GraphQL API for Lineage Data Display

## Overview
After the Fabric notebook job completes successfully, we'll fetch and display data from the GraphQL API to show that the lineage data has been properly written to the Lakehouse. This will query the three tables: `lineage_nodes`, `lineage_edges`, and `lineage_summary`.

## Architecture

```text
+-------------------+     +----------------------+     +-------------------+
|   React Frontend  | --> | Edge Function        | --> | Fabric GraphQL    |
|   (Index.tsx)     |     | (query-fabric-       |     | API               |
|                   |     |  graphql)            |     |                   |
+-------------------+     +----------------------+     +-------------------+
        ^                         |                           |
        |                         v                           |
        |                 +----------------+                  |
        |                 | Service        |                  |
        |                 | Principal Auth |<-----------------+
        |                 +----------------+
        |                         |
        +-------------------------+
              Returns lineage data
```

## What Will Be Built

### 1. New Edge Function: `query-fabric-graphql`
A backend function that:
- Authenticates with Azure using the same Service Principal credentials
- Queries the Fabric GraphQL API endpoint
- Returns data from `lineage_nodes`, `lineage_edges`, and `lineage_summary` tables
- Accepts optional filters (e.g., sales_contract) to scope the query

### 2. New Frontend Component: `GraphQLDataPreview`
A tabbed data preview component that:
- Shows first 10-20 rows from each of the three tables
- Displays in a clean table format with proper column headers
- Includes loading states and error handling
- Appears automatically after the Fabric job succeeds

### 3. Frontend Integration in Index.tsx
Updates to the Fabric mode section:
- Auto-fetch GraphQL data when job status becomes "Succeeded"
- Display the `GraphQLDataPreview` component below the job status
- Add manual refresh button for re-fetching data

## Implementation Steps

### Step 1: Create the Edge Function
Create `supabase/functions/query-fabric-graphql/index.ts`:
- Reuse the `getAccessToken()` pattern from existing edge functions
- Accept POST request with optional `sales_contract` filter
- Build GraphQL queries for each table (first 20 rows)
- Return combined data object

### Step 2: Add Frontend API Client
Update `src/lib/fabricApi.ts`:
- Add `queryFabricGraphQL()` function to call the new edge function
- Define TypeScript interfaces for the response data
- Include proper error handling

### Step 3: Create Data Preview Component
Create `src/components/GraphQLDataPreview.tsx`:
- Tabbed interface for the three tables
- Table display using existing shadcn/ui Table component
- Loading skeleton states
- Error display with retry option

### Step 4: Integrate into Index.tsx
Modify the Fabric mode section:
- Add state for GraphQL data and loading
- Trigger data fetch when `fabricJobStatus` becomes "Succeeded"
- Render the `GraphQLDataPreview` component when data is available

## New Secret Required
The GraphQL API endpoint URL will be stored as a secret:
- **FABRIC_GRAPHQL_ENDPOINT**: `https://c878dff550fc4f4492d85f24c900ad9f.zc8.graphql.fabric.microsoft.com/v1/workspaces/c878dff5-50fc-4f44-92d8-5f24c900ad9f/graphqlapis/46980ebd-c550-4770-b3f4-f08a2bc4af09/graphql`

---

## Technical Details

### Edge Function GraphQL Query Structure
```graphql
query GetLineageData {
  lineage_nodes(first: 20) {
    items {
      # all available fields - will use introspection
    }
  }
  lineage_edges(first: 20) {
    items {
      # all available fields
    }
  }
  lineage_summary(first: 20) {
    items {
      # all available fields
    }
  }
}
```

### Response Data Interface
```typescript
interface GraphQLLineageData {
  lineage_nodes: Array<Record<string, unknown>>;
  lineage_edges: Array<Record<string, unknown>>;
  lineage_summary: Array<Record<string, unknown>>;
}
```

### Component Props
```typescript
interface GraphQLDataPreviewProps {
  data: GraphQLLineageData | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/query-fabric-graphql/index.ts` | Create | New edge function for GraphQL queries |
| `src/lib/fabricApi.ts` | Modify | Add `queryFabricGraphQL()` function |
| `src/components/GraphQLDataPreview.tsx` | Create | New data preview component |
| `src/pages/Index.tsx` | Modify | Integrate GraphQL data fetch and display |
| `supabase/config.toml` | Modify | Add config for new edge function |
