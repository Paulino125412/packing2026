# Security Specification for TexFlow

## 1. Data Invariants
* **Providers**: A provider must have a valid `name` (non-empty string <= 128 characters) and boolean config flags for handling lots, partidas, tonos, and roll numbers.
* **Articles**: An article must have a valid `name` and reference an existing `providerId` (validated as format/size check).
* **Clients**: A client must have a valid `name` and a `dni` string (8 to 12 chars).
* **Sellers**: A seller must have a valid `name`.
* **Inventory**: A roll must have a `rollNumber`, `articleId`, `providerId`, non-negative meters, and a status.
* **Movements**: A log entry must have a type, itemId, rollNumber, articleName, metersChanged, and operator name.
* **Packing Lists**: A dispatch packing list must have a packing list number, a type, valid client/seller IDs, and a non-empty array of items with total counts.

## 2. The "Dirty Dozen" Payloads (Exploit Payloads)
The following payloads attempt to insert malicious, corrupt, or invalid schema values:
1. **Junk ID Poisoning**: Trying to create a provider with a 2KB junk character string ID.
2. **Empty Provider Name**: Creating a provider with an empty name.
3. **Invalid Provider Config Type**: Setting `hasLot` to a 100-character string instead of a boolean.
4. **Article Orphaned / No Provider**: Creating an article without a `providerId`.
5. **Article Name Too Long**: Creating an article with a name of 1000 characters.
6. **Client DNI Too Short**: Creating a client with a 2-digit DNI.
7. **Negative Inventory Meters**: Creating or updating an inventory roll with `-50` current meters.
8. **Inventory Status Too Long**: Setting an inventory status to a 500-character string.
9. **Movement Blank Type**: Creating a movement log with an empty `type`.
10. **Packing List Negative Totals**: Creating a packing list with `-150` total meters.
11. **Packing List Large Array**: Creating a packing list with 50,000 item entries to trigger resource exhaustion.
12. **Seller Missing Name**: Creating a seller document with a null or missing name.

## 3. Test Runner Specification
These exploits are blocked at the Firestore security rules layer by enforcing strict schema types, size bounds, and ID validation regex checks.
