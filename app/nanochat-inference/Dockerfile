# Use a lightweight Python base image
FROM python:3.10-slim-buster

# Set working directory
WORKDIR /app

# Install git for cloning nanochat repo
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone the nanochat repository
# It's highly recommended to pin to a specific commit hash for reproducibility
# For example: RUN git clone https://github.com/karpathy/nanochat.git . && git checkout <COMMIT_HASH>
RUN git clone https://github.com/karpathy/nanochat.git nanochat_repo

# Copy the requirements file
COPY app/nanochat-inference/requirements.txt ./requirements.txt

# Install dependencies, including nanochat's (if any are not in the main requirements.txt)
# The nanochat project uses `uv` for dependency management, but for a Docker build
# we will rely on standard pip for the listed requirements and then potentially
# use `uv` later if necessary for nanochat's internal dev dependencies.
RUN pip install --no-cache-dir -r requirements.txt

# Add the cloned nanochat repo to Python path (assuming its structure)
ENV PYTHONPATH=/app/nanochat_repo:$PYTHONPATH

# Copy the inference server application
COPY app/nanochat-inference/inference_server.py ./inference_server.py

# Expose the port FastAPI will run on
EXPOSE 8000

# Command to run the FastAPI application with Uvicorn
CMD ["uvicorn", "inference_server:app", "--host", "0.0.0.0", "--port", "8000"]
