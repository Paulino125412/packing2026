# Security Specification for TexFlow

## 1. Data Invariants
* **Providers**: A provider must have a valid `name` (non-empty string <= 128 characters) and boolean config flags for handling lots, partidas, tonos, and roll numbers. In updates, `createdAt` is immutable.
* **Articles**: An article must have a valid `name` and reference an existing `providerId` (validated as format/size check). In updates, `createdAt` is immutable.
* **Clients**: A client must have a valid `name` and a `dni` string (8 to 30 characters, accommodating DNI, RUC, Carné de Extranjería, and Passport). In updates, `createdAt` is immutable.
* **Sellers**: A seller must have a valid `name`. In updates, `createdAt` is immutable.
* **Inventory**: A roll must have a `rollNumber`, `articleId`, `providerId`, non-negative meters, a strict status enum (`available`, `sold`, or `partially_sold`), and physical metric coherence where `currentMeters <= initialMeters + 0.05`. In updates, `createdAt` is immutable.
* **Packing Lists**: A dispatch packing list must have a packing list number, a strict type enum (`nuevo`, `antiguo`, `corte`, or `rollo`), valid client/seller IDs, and an array of items with non-negative total counts. In updates, `packingListNo` and `createdAt` are strictly immutable.
* **Sales Orders**: An order must have a valid `orderNo`, client info, items list, and non-negative total amount. In updates, `orderNo` and `createdAt` are strictly immutable.
* **Counters**: Atomic sequence counters must have non-negative `currentValue` on creation. In updates, `currentValue` must be strictly monotonically non-decreasing (`incoming.currentValue >= resource.data.currentValue`) to prevent backward sequence regression. Counter documents can never be deleted (`allow delete: if false`).
* **Movements (Future Requirement)**: Note that dedicated movement logs are handled via atomic roll-level updates in the current version; a standalone `movements` audit collection is planned for future audit telemetry.

## 2. The "Dirty Dozen" Payloads (Exploit Payloads)
The following payloads attempt to insert malicious, corrupt, or invalid schema values and are blocked at the Firestore security rules layer:
1. **Junk ID Poisoning**: Trying to create a provider with a 2KB junk character string ID.
2. **Empty Provider Name**: Creating a provider with an empty name.
3. **Invalid Provider Config Type**: Setting `hasLot` to a 100-character string instead of a boolean.
4. **Article Orphaned / No Provider**: Creating an article without a `providerId`.
5. **Article Name Too Long**: Creating an article with a name of 1000 characters.
6. **Client DNI Too Short**: Creating a client with a 2-digit DNI (< 8 characters).
7. **Negative Inventory Meters**: Creating or updating an inventory roll with `-50` current meters.
8. **Inventory Status Invalid / Too Long**: Setting an inventory status to an unauthorized string or exceeding the allowed enum values (`available`, `sold`, `partially_sold`).
9. **Inventory Current Meters Exceeding Initial**: Updating a roll to have current meters significantly greater than initial meters (violating `currentMeters <= initialMeters + 0.05`).
10. **Packing List Invalid Type**: Creating a packing list with an unrecognized dispatch type (outside `nuevo`, `antiguo`, `corte`, `rollo`).
11. **Packing List Negative Totals**: Creating a packing list with `-150` total meters.
12. **Packing List Large Array**: Creating a packing list with 50,000 item entries to trigger resource exhaustion.
13. **Packing List Number Tampering**: Attempting to alter `packingListNo` during an update operation.
14. **Counter Regression / Reset**: Attempting to decrease a counter's `currentValue` or delete a counter document.
15. **Seller Missing Name**: Creating a seller document with a null or missing name.

## 3. Test Runner Specification
These exploits are blocked at the Firestore security rules layer by enforcing strict schema types, size bounds, regex checks, monotonic update conditions, and immutability guards on update operations.
