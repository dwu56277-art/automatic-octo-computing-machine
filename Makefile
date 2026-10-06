.PHONY: openmontage-setup openmontage openmontage-demo

openmontage-setup:
	./scripts/openmontage.sh install

openmontage:
	./scripts/openmontage.sh open

openmontage-demo:
	./scripts/openmontage.sh simulate
