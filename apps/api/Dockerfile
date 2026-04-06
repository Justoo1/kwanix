FROM python:3.11-slim

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install uv --no-cache-dir

# Copy dependency manifest first (layer cache)
COPY pyproject.toml .

# Install all dependencies including dev extras
RUN uv pip install -e ".[dev]" --system --no-cache

# Copy the rest of the application
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--limit-request-body", "1048576"]
