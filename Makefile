.ONESHELL:

build:
	cd ./backend
	./scripts/build.sh
	cd ../frontend
	./scripts/build.sh

run: build
	docker stop watch2play-frontend
	docker stop watch2play-backend
	./backend/scripts/start.sh
	./frontend/scripts/start.sh
	docker logs -f watch2play-backend
