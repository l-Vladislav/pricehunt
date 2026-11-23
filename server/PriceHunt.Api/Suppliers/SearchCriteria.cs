namespace PriceHunt.Api.Suppliers;

public record SearchCriteria(string FromLocation, string ToLocation, DateOnly FromDate, DateOnly ToDate);
