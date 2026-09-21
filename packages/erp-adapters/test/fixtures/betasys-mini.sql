-- Deterministic test fixture; production BetaSys snapshots are validated separately.
INSERT INTO `legacy_accounts` (`id`, `sourceId`, `accountNo`, `parentId`, `name`, `balance`) VALUES (1, 'a1', '1', '0', 'الأصول', '0.00');
INSERT INTO `legacy_items` (`id`, `sourceId`, `name`, `stockQty`, `averageCost`, `salePrice`) VALUES (2, 'i1', 'صنف أول', '2.000', '10.00', '15.00');
INSERT INTO `legacy_items` (`id`, `sourceId`, `name`, `stockQty`, `averageCost`, `salePrice`) VALUES (3, 'i1', 'صنف مكرر', '1.000', '5.00', '8.00');
INSERT INTO `legacy_parties` (`id`, `sourceId`, `name`, `type`, `balance`) VALUES (4, 'p1', 'عميل تجريبي', 'customer', '5.00');
INSERT INTO `legacy_operations` (`id`, `sourceId`, `operationNo`, `operationDate`, `total`, `tax`) VALUES (5, 'o1', '1', '01/01/2024', '10.00', '0.00');
