using System.Text.Json;
using System.Text.Json.Serialization;
using PriceHunt.Api.Data;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins("http://localhost:4142").AllowAnyHeader().AllowAnyMethod()));

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

builder.Services.AddProblemDetails();
builder.Services.AddValidation();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSuppliers();
builder.Services.AddDatabase();
builder.Services.AddSingleton<SearchOrchestrator>();

var app = builder.Build();

app.MigrateDatabase();

app.UseCors();
app.MapSupplierEndpoints();
app.MapSearchEndpoints();

app.Run();
