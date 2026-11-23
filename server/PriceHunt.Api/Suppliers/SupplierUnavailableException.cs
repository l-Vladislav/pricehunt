namespace PriceHunt.Api.Suppliers;

public sealed class SupplierUnavailableException(string supplierId)
    : Exception($"Supplier '{supplierId}' is unavailable.");
