using PriceHunt.Api.Suppliers;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins("http://localhost:4142").AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSuppliers();

var app = builder.Build();

app.UseCors();
app.MapSupplierEndpoints();

app.Run();
