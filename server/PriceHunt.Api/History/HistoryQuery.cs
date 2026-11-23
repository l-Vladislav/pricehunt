using System.ComponentModel.DataAnnotations;

namespace PriceHunt.Api.History;

// A record, not a class: on a class, properties with initializers still count as required.
// The page cap keeps (Page - 1) * PageSize inside int.
public record HistoryQuery(
    DateTimeOffset? StartDate = null,
    DateTimeOffset? EndDate = null,
    string[]? SupplierIds = null,
    string? FromLocation = null,
    string? ToLocation = null,
    [AllowedValues("date", "route", "supplier", "price", "responseTime")] string SortBy = "date",
    [AllowedValues("asc", "desc")] string SortDir = "desc",
    [Range(1, 1_000_000)] int Page = 1,
    [Range(1, 100)] int PageSize = 20) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (StartDate >= EndDate)
            yield return new ValidationResult("The start date must be before the end date.", [nameof(StartDate)]);
    }
}

public record HistoryItem(
    long Id, DateTime Date, string FromLocation, string ToLocation, string SupplierName, decimal? Price, long ResponseTimeMs);

public record HistoryPage(IReadOnlyList<HistoryItem> Items, int Total, int Page, int PageSize);
