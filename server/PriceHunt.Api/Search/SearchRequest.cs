using System.ComponentModel.DataAnnotations;

namespace PriceHunt.Api.Search;

// Validated by the built-in Minimal API validation before the handler runs (SS1).
// The dates are nullable so a missing date fails [Required] instead of binding as 0001-01-01.
// Null or empty SupplierIds means all suppliers.
public record SearchRequest(
    Guid SearchId,
    [Required] string FromLocation,
    [Required] string ToLocation,
    [Required] DateOnly? FromDate,
    [Required] DateOnly? ToDate,
    IReadOnlyList<string>? SupplierIds) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (SearchId == Guid.Empty)
            yield return new ValidationResult("The search id must not be empty.", [nameof(SearchId)]);
        if (FromDate > ToDate)
            yield return new ValidationResult("The start date must not be after the end date.", [nameof(FromDate)]);
    }
}
