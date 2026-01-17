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

deploy: build
	docker tag watch2play-frontend 192.168.2.203:5000/watch2play-frontend:latest
	docker tag watch2play-backend 192.168.2.203:5000/watch2play-backend:latest
	docker push 192.168.2.203:5000/watch2play-frontend:latest
	docker push 192.168.2.203:5000/watch2play-backend:latest

