FROM python:3.11-slim

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install uv --no-cache-dir

# Copy dependency manifest first (layer cache)
COPY pyproject.toml .

# Install all dependencies including dev extras
RUN uv pip install -e ".[dev]" --system --no-cache

# Copy entrypoint (source code is mounted via volume in dev, but entrypoint
# must be in the image so it exists before the volume mount overwrites /app)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--limit-request-body", "1048576"]
